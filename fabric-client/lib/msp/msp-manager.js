/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

'use strict';

var util = require('util');
var path = require('path');
var grpc = require('grpc');

var MSP = require('./msp.js');
var utils = require('../utils.js');
var idModule = require('./identity.js');
var SigningIdentity = idModule.SigningIdentity;
var Signer = idModule.Signer;

var mspProto = grpc.load(path.join(__dirname, '../protos/msp/mspconfig.proto')).msp;
var identityProto = grpc.load(path.join(__dirname, '../protos/identity.proto')).msp;

var MSPManager = class {
	constructor() {
		this._msps = {};
	}

	loadMSPs(mspConfigs) {
		var self = this;
		if (!mspConfigs || !Array.isArray(mspConfigs))
			throw new Error('"mspConfigs" argument must be an array');

		mspConfigs.forEach((config) => {
			if (typeof config.getType() !== 'number' || config.getType() !== 0)
				throw new Error(util.format('MSP Configuration object type not supported: %s', config.getType()));

			if (!config.getConfig || !config.getConfig())
				throw new Error('MSP Configuration object missing the payload in the "Config" property');

			var fabricConfig = mspProto.FabricMSPConfig.decode(config.getConfig());

			if (!fabricConfig.getName())
				throw new Error('MSP Configuration does not have a name');

			// with this method we are only dealing with verifying MSPs, not local MSPs. Local MSPs are instantiated
			// from user enrollment materials (see User class). For verifying MSPs the root certificates are always
			// required
			if (!fabricConfig.getRootCerts())
				throw new Error('MSP Configuration does not have any root certificates required for validating signing certificates');

			// TODO: for now using application-scope defaults but crypto parameters like key size, hash family
			// and digital signature algorithm should be from the config itself
			var cs = utils.getCryptoSuite();

			var newMSP = new MSP({
				rootCerts: fabricConfig.getRootCerts(),
				admins: fabricConfig.getAdmins(),
				id: fabricConfig.getName(),
				cryptoSuite: cs
			});

			self._msps[fabricConfig.getName()] = newMSP;
		});
	}

	getMSPs() {
		return this._msps;
	}

	/**
	 * DeserializeIdentity deserializes an identity
	 * @param {byte[]} serializedIdentity A protobuf-based serialization of an object with
	 * two fields: mspid and idBytes for certificate PEM bytes
	 * @returns {Promise} Promise for an {@link Identity} instance
	 */
	deserializeIdentity(serializedIdentity) {
		var sid = identityProto.SerializedIdentity.decode(serializedIdentity);
		var mspid = sid.getMspid();
		var msp = this._msps[mspid];

		if (!msp)
			throw new Error(util.format('Failed to locate an MSP instance matching the requested id "%s" in the deserialized identity', mspid));

		return msp.deserializeIdentity(serializedIdentity);
	}
};

module.exports = MSPManager;