/*******************************************************************************
 * Copyright (c) 2013 IBM Corp.
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and Eclipse Distribution License v1.0 which accompany this distribution.
 *
 * The Eclipse Public License is available at
 *    http://www.eclipse.org/legal/epl-v10.html
 * and the Eclipse Distribution License is available at
 *   http://www.eclipse.org/org/documents/edl-v10.php.
 *
 * Contributors:
 *    Andrew Banks - initial API and implementation and initial documentation
 *******************************************************************************/


// Only expose a single object name in the global namespace.
// Everything must go through this module. Global Paho module
// only has a single public function, client, which returns
// a Paho client object given connection details.

/**
 * Send and receive messages using web browsers.
 * <p>
 * This programming interface lets a JavaScript client application use the MQTT V3.1 or
 * V3.1.1 protocol to connect to an MQTT-supporting messaging server.
 *
 * The function supported includes:
 * <ol>
 * <li>Connecting to and disconnecting from a server. The server is identified by its host name and port number.
 * <li>Specifying options that relate to the communications link with the server,
 * for example the frequency of keep-alive heartbeats, and whether SSL/TLS is required.
 * <li>Subscribing to and receiving messages from MQTT Topics.
 * <li>Publishing messages to MQTT Topics.
 * </ol>
 * <p>
 * The API consists of two main objects:
 * <dl>
 * <dt><b>{@link Paho.Client}</b></dt>
 * <dd>This contains methods that provide the functionality of the API,
 * including provision of callbacks that notify the application when a message
 * arrives from or is delivered to the messaging server,
 * or when the status of its connection to the messaging server changes.</dd>
 * <dt><b>{@link Paho.Message}</b></dt>
 * <dd>This encapsulates the payload of the message along with various attributes
 * associated with its delivery, in particular the destination to which it has
 * been (or is about to be) sent.</dd>
 * </dl>
 * <p>
 * The programming interface validates parameters passed to it, and will throw
 * an Error containing an error message intended for developer use, if it detects
 * an error with any parameter.
 * <p>
 * Example:
 *
 * <code><pre>
var client = new Paho.MQTT.Client(location.hostname, Number(location.port), "clientId");
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({onSuccess:onConnect});

function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  client.subscribe("/World");
  var message = new Paho.MQTT.Message("Hello");
  message.destinationName = "/World";
  client.send(message);
};
function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0)
	console.log("onConnectionLost:"+responseObject.errorMessage);
};
function onMessageArrived(message) {
  console.log("onMessageArrived:"+message.payloadString);
  client.disconnect();
};
 * </pre></code>
 * @namespace Paho
 */

/* jshint shadow:true */
(function ExportLibrary(root, factory) {
	if(typeof exports === "object" && typeof module === "object"){
		module.exports = factory();
	} else if (typeof define === "function" && define.amd){
		define(factory);
	} else if (typeof exports === "object"){
		exports = factory();
	} else {
		//if (typeof root.Paho === "undefined"){
		//	root.Paho = {};
		//}
		root.Paho = factory();
	}
})(this, function LibraryFactory(){


	var PahoMQTT = (function (global) {

	// Private variables below, these are only visible inside the function closure
	// which is used to define the module.
	var version = "@VERSION@-@BUILDLEVEL@";

	/**
	 * @private
	 */
	var localStorage = global.localStorage || (function () {
		var data = {};

		return {
			setItem: function (key, item) { data[key] = item; },
			getItem: function (key) { return data[key]; },
			removeItem: function (key) { delete data[key]; },
		};
	})();

		/**
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private
	 */
		var MESSAGE_TYPE = {
			CONNECT: 1,
			CONNACK: 2,
			PUBLISH: 3,
			PUBACK: 4,
			PUBREC: 5,
			PUBREL: 6,
			PUBCOMP: 7,
			SUBSCRIBE: 8,
			SUBACK: 9,
			UNSUBSCRIBE: 10,
			UNSUBACK: 11,
			PINGREQ: 12,
			PINGRESP: 13,
			DISCONNECT: 14
		};

		// Collection of utility methods used to simplify module code
		// and promote the DRY pattern.

		/**
	 * Validate an object's parameter names to ensure they
	 * match a list of expected variables name for this option
	 * type. Used to ensure option object passed into the API don't
	 * contain erroneous parameters.
	 * @param {Object} obj - User options object
	 * @param {Object} keys - valid keys and types that may exist in obj.
	 * @throws {Error} Invalid option parameter found.
	 * @private
	 */
		var validate = function(obj, keys) {
			for (var key in obj) {
				if (obj.hasOwnProperty(key)) {
					if (keys.hasOwnProperty(key)) {
						if (typeof obj[key] !== keys[key])
							throw new Error(format(ERROR.INVALID_TYPE, [typeof obj[key], key]));
					} else {
						var errorStr = "Unknown property, " + key + ". Valid properties are:";
						for (var validKey in keys)
							if (keys.hasOwnProperty(validKey))
								errorStr = errorStr+" "+validKey;
						throw new Error(errorStr);
					}
				}
			}
		};

		/**
	 * Return a new function which runs the user function bound
	 * to a fixed scope.
	 * @param {function} User function
	 * @param {object} Function scope
	 * @return {function} User function bound to another scope
	 * @private
	 */
		var scope = function (f, scope) {
			return function () {
				return f.apply(scope, arguments);
			};
		};

		/**
	 * Unique message type identifiers, with associated
	 * associated integer values.
	 * @private
	 */
		var ERROR = {
			OK: {code:0, text:"AMQJSC0000I OK."},
			CONNECT_TIMEOUT: {code:1, text:"AMQJSC0001E Connect timed out."},
			SUBSCRIBE_TIMEOUT: {code:2, text:"AMQJS0002E Subscribe timed out."},
			UNSUBSCRIBE_TIMEOUT: {code:3, text:"AMQJS0003E Unsubscribe timed out."},
			PING_TIMEOUT: {code:4, text:"AMQJS0004E Ping timed out."},
			INTERNAL_ERROR: {code:5, text:"AMQJS0005E Internal error. Error Message: {0}, Stack trace: {1}"},
			CONNACK_RETURNCODE: {code:6, text:"AMQJS0006E Bad Connack return code:{0} {1}."},
			SOCKET_ERROR: {code:7, text:"AMQJS0007E Socket error:{0}."},
			SOCKET_CLOSE: {code:8, text:"AMQJS0008I Socket closed."},
			MALFORMED_UTF: {code:9, text:"AMQJS0009E Malformed UTF data:{0} {1} {2}."},
			UNSUPPORTED: {code:10, text:"AMQJS0010E {0} is not supported by this browser."},
			INVALID_STATE: {code:11, text:"AMQJS0011E Invalid state {0}."},
			INVALID_TYPE: {code:12, text:"AMQJS0012E Invalid type {0} for {1}."},
			INVALID_ARGUMENT: {code:13, text:"AMQJS0013E Invalid argument {0} for {1}."},
			UNSUPPORTED_OPERATION: {code:14, text:"AMQJS0014E Unsupported operation."},
			INVALID_STORED_DATA: {code:15, text:"AMQJS0015E Invalid data in local storage key={0} value={1}."},
			INVALID_MQTT_MESSAGE_TYPE: {code:16, text:"AMQJS0016E Invalid MQTT message type {0}."},
			MALFORMED_UNICODE: {code:17, text:"AMQJS0017E Malformed Unicode string:{0} {1}."},
			BUFFER_FULL: {code:18, text:"AMQJS0018E Message buffer is full, maximum buffer size: {0}."},
		};

		/** CONNACK RC Meaning. */
		var CONNACK_RC = {
			0:"Connection Accepted",
			1:"Connection Refused: unacceptable protocol version",
			2:"Connection Refused: identifier rejected",
			3:"Connection Refused: server unavailable",
			4:"Connection Refused: bad user name or password",
			5:"Connection Refused: not authorized"
		};

	/**
	 * Format an error message text.
	 * @private
	 * @param {error} ERROR value above.
	 * @param {substitutions} [array] substituted into the text.
	 * @return the text with the substitutions made.
	 */
		var format = function(error, substitutions) {
			var text = error.text;
			if (substitutions) {
				var field,start;
				for (var i=0; i<substitutions.length; i++) {
					field = "{"+i+"}";
					start = text.indexOf(field);
					if(start > 0) {
						var part1 = text.substring(0,start);
						var part2 = text.substring(start+field.length);
						text = part1+substitutions[i]+part2;
					}
				}
			}
			return text;
		};

		//MQTT protocol and version          6    M    Q    I    s    d    p    3
		var MqttProtoIdentifierv3 = [0x00,0x06,0x4d,0x51,0x49,0x73,0x64,0x70,0x03];
		//MQTT proto/version for 311         4    M    Q    T    T    4
		var MqttProtoIdentifierv4 = [0x00,0x04,0x4d,0x51,0x54,0x54,0x04];

		/**
	 * Construct an MQTT wire protocol message.
	 * @param type MQTT packet type.
	 * @param options optional wire message attributes.
	 *
	 * Optional properties
	 *
	 * messageIdentifier: message ID in the range [0..65535]
	 * payloadMessage:	Application Message - PUBLISH only
	 * connectStrings:	array of 0 or more Strings to be put into the CONNECT payload
	 * topics:			array of strings (SUBSCRIBE, UNSUBSCRIBE)
	 * requestQoS:		array of QoS values [0..2]
	 *
	 * "Flag" properties
	 * cleanSession:	true if present / false if absent (CONNECT)
	 * willMessage:  	true if present / false if absent (CONNECT)
	 * isRetained:		true if present / false if absent (CONNECT)
	 * userName:		true if present / false if absent (CONNECT)
	 * password:		true if present / false if absent (CONNECT)
	 * keepAliveInterval:	integer [0..65535]  (CONNECT)
	 *
	 * @private
	 * @ignore
	 */
		var WireMessage = function (type, options) {
			this.type = type;
			for (var name in options) {
				if (options.hasOwnProperty(name)) {
					this[name] = options[name];
				}
			}
		};

		WireMessage.prototype.encode = function() {
		// Compute the first byte of the fixed header
			var first = ((this.type & 0x0f) << 4);

			/*
		 * Now calculate the length of the variable header + payload by adding up the lengths
		 * of all the component parts
		 */

			var remLength = 0;
			var topicStrLength = [];
			var destinationNameLength = 0;
			var willMessagePayloadBytes;

			// if the message contains a messageIdentifier then we need two bytes for that
			if (this.messageIdentifier !== undefined)
				remLength += 2;

			switch(this.type) {
			// If this a Connect then we need to include 12 bytes for its header
			case MESSAGE_TYPE.CONNECT:
				switch(this.mqttVersion) {
				case 3:
					remLength += MqttProtoIdentifierv3.length + 3;
					break;
				case 4:
					remLength += MqttProtoIdentifierv4.length + 3;
					break;
				}

				remLength += UTF8Length(this.clientId) + 2;
				if (this.willMessage !== undefined) {
					remLength += UTF8Length(this.willMessage.destinationName) + 2;
					// Will message is always a string, sent as UTF-8 characters with a preceding length.
					willMessagePayloadBytes = this.willMessage.payloadBytes;
					if (!(willMessagePayloadBytes instanceof Uint8Array))
						willMessagePayloadBytes = new Uint8Array(payloadBytes);
					remLength += willMessagePayloadBytes.byteLength +2;
				}
				if (this.userName !== undefined)
					remLength += UTF8Length(this.userName) + 2;
				if (this.password !== undefined)
					remLength += UTF8Length(this.password) + 2;
				break;

			// Subscribe, Unsubscribe can both contain topic strings
			case MESSAGE_TYPE.SUBSCRIBE:
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				remLength += this.requestedQos.length; // 1 byte for each topic's Qos
				// QoS on Subscribe only
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:
				first |= 0x02; // Qos = 1;
				for ( var i = 0; i < this.topics.length; i++) {
					topicStrLength[i] = UTF8Length(this.topics[i]);
					remLength += topicStrLength[i] + 2;
				}
				break;

			case MESSAGE_TYPE.PUBREL:
				first |= 0x02; // Qos = 1;
				break;

			case MESSAGE_TYPE.PUBLISH:
				if (this.payloadMessage.duplicate) first |= 0x08;
				first  = first |= (this.payloadMessage.qos << 1);
				if (this.payloadMessage.retained) first |= 0x01;
				destinationNameLength = UTF8Length(this.payloadMessage.destinationName);
				remLength += destinationNameLength + 2;
				var payloadBytes = this.payloadMessage.payloadBytes;
				remLength += payloadBytes.byteLength;
				if (payloadBytes instanceof ArrayBuffer)
					payloadBytes = new Uint8Array(payloadBytes);
				else if (!(payloadBytes instanceof Uint8Array))
					payloadBytes = new Uint8Array(payloadBytes.buffer);
				break;

			case MESSAGE_TYPE.DISCONNECT:
				break;

			default:
				break;
			}

			// Now we can allocate a buffer for the message

			var mbi = encodeMBI(remLength);  // Convert the length to MQTT MBI format
			var pos = mbi.length + 1;        // Offset of start of variable header
			var buffer = new ArrayBuffer(remLength + pos);
			var byteStream = new Uint8Array(buffer);    // view it as a sequence of bytes

			//Write the fixed header into the buffer
			byteStream[0] = first;
			byteStream.set(mbi,1);

			// If this is a PUBLISH then the variable header starts with a topic
			if (this.type == MESSAGE_TYPE.PUBLISH)
				pos = writeString(this.payloadMessage.destinationName, destinationNameLength, byteStream, pos);
			// If this is a CONNECT then the variable header contains the protocol name/version, flags and keepalive time

			else if (this.type == MESSAGE_TYPE.CONNECT) {
				switch (this.mqttVersion) {
				case 3:
					byteStream.set(MqttProtoIdentifierv3, pos);
					pos += MqttProtoIdentifierv3.length;
					break;
				case 4:
					byteStream.set(MqttProtoIdentifierv4, pos);
					pos += MqttProtoIdentifierv4.length;
					break;
				}
				var connectFlags = 0;
				if (this.cleanSession)
					connectFlags = 0x02;
				if (this.willMessage !== undefined ) {
					connectFlags |= 0x04;
					connectFlags |= (this.willMessage.qos<<3);
					if (this.willMessage.retained) {
						connectFlags |= 0x20;
					}
				}
				if (this.userName !== undefined)
					connectFlags |= 0x80;
				if (this.password !== undefined)
					connectFlags |= 0x40;
				byteStream[pos++] = connectFlags;
				pos = writeUint16 (this.keepAliveInterval, byteStream, pos);
			}

			// Output the messageIdentifier - if there is one
			if (this.messageIdentifier !== undefined)
				pos = writeUint16 (this.messageIdentifier, byteStream, pos);

			switch(this.type) {
			case MESSAGE_TYPE.CONNECT:
				pos = writeString(this.clientId, UTF8Length(this.clientId), byteStream, pos);
				if (this.willMessage !== undefined) {
					pos = writeString(this.willMessage.destinationName, UTF8Length(this.willMessage.destinationName), byteStream, pos);
					pos = writeUint16(willMessagePayloadBytes.byteLength, byteStream, pos);
					byteStream.set(willMessagePayloadBytes, pos);
					pos += willMessagePayloadBytes.byteLength;

				}
				if (this.userName !== undefined)
					pos = writeString(this.userName, UTF8Length(this.userName), byteStream, pos);
				if (this.password !== undefined)
					pos = writeString(this.password, UTF8Length(this.password), byteStream, pos);
				break;

			case MESSAGE_TYPE.PUBLISH:
				// PUBLISH has a text or binary payload, if text do not add a 2 byte length field, just the UTF characters.
				byteStream.set(payloadBytes, pos);

				break;

				//    	    case MESSAGE_TYPE.PUBREC:
				//    	    case MESSAGE_TYPE.PUBREL:
				//    	    case MESSAGE_TYPE.PUBCOMP:
				//    	    	break;

			case MESSAGE_TYPE.SUBSCRIBE:
				// SUBSCRIBE has a list of topic strings and request QoS
				for (var i=0; i<this.topics.length; i++) {
					pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
					byteStream[pos++] = this.requestedQos[i];
				}
				break;

			case MESSAGE_TYPE.UNSUBSCRIBE:
				// UNSUBSCRIBE has a list of topic strings
				for (var i=0; i<this.topics.length; i++)
					pos = writeString(this.topics[i], topicStrLength[i], byteStream, pos);
				break;

			default:
				// Do nothing.
			}

			return buffer;
		};

		function decodeMessage(input,pos) {
			var startingPos = pos;
			var first = input[pos];
			var type = first >> 4;
			var messageInfo = first &= 0x0f;
			pos += 1;


			// Decode the remaining length (MBI format)

			var digit;
			var remLength = 0;
			var multiplier = 1;
			do {
				if (pos == input.length) {
					return [null,startingPos];
				}
				digit = input[pos++];
				remLength += ((digit & 0x7F) * multiplier);
				multiplier *= 128;
			} while ((digit & 0x80) !== 0);

			var endPos = pos+remLength;
			if (endPos > input.length) {
				return [null,startingPos];
			}

			var wireMessage = new WireMessage(type);
			switch(type) {
			case MESSAGE_TYPE.CONNACK:
				var connectAcknowledgeFlags = input[pos++];
				if (connectAcknowledgeFlags & 0x01)
					wireMessage.sessionPresent = true;
				wireMessage.returnCode = input[pos++];
				break;

			case MESSAGE_TYPE.PUBLISH:
				var qos = (messageInfo >> 1) & 0x03;

				var len = readUint16(input, pos);
				pos += 2;
				var topicName = parseUTF8(input, pos, len);
				pos += len;
				// If QoS 1 or 2 there will be a messageIdentifier
				if (qos > 0) {
					wireMessage.messageIdentifier = readUint16(input, pos);
					pos += 2;
				}

				var message = new Message(input.subarray(pos, endPos));
				if ((messageInfo & 0x01) == 0x01)
					message.retained = true;
				if ((messageInfo & 0x08) == 0x08)
					message.duplicate =  true;
				message.qos = qos;
				message.destinationName = topicName;
				wireMessage.payloadMessage = message;
				break;

			case  MESSAGE_TYPE.PUBACK:
			case  MESSAGE_TYPE.PUBREC:
			case  MESSAGE_TYPE.PUBREL:
			case  MESSAGE_TYPE.PUBCOMP:
			case  MESSAGE_TYPE.UNSUBACK:
				wireMessage.messageIdentifier = readUint16(input, pos);
				break;

			case  MESSAGE_TYPE.SUBACK:
				wireMessage.messageIdentifier = readUint16(input, pos);
				pos += 2;
				wireMessage.returnCode = input.subarray(pos, endPos);
				break;

			default:
				break;
			}

			return [wireMessage,endPos];
		}

		function writeUint16(input, buffer, offset) {
			buffer[offset++] = input >> 8;      //MSB
			buffer[offset++] = input % 256;     //LSB
			return offset;
		}

		function writeString(input, utf8Length, buffer, offset) {
			offset = writeUint16(utf8Length, buffer, offset);
			stringToUTF8(input, buffer, offset);
			return offset + utf8Length;
		}

		function readUint16(buffer, offset) {
			return 256*buffer[offset] + buffer[offset+1];
		}

		/**
	 * Encodes an MQTT Multi-Byte Integer
	 * @private
	 */
		function encodeMBI(number) {
			var output = new Array(1);
			var numBytes = 0;

			do {
				var digit = number % 128;
				number = number >> 7;
				if (number > 0) {
					digit |= 0x80;
				}
				output[numBytes++] = digit;
			} while ( (number > 0) && (numBytes<4) );

			return output;
		}

		/**
	 * Takes a String and calculates its length in bytes when encoded in UTF8.
	 * @private
	 */
		function UTF8Length(input) {
			var output = 0;
			for (var i = 0; i<input.length; i++)
			{
				var charCode = input.charCodeAt(i);
				if (charCode > 0x7FF)
				{
					// Surrogate pair means its a 4 byte character
					if (0xD800 <= charCode && charCode <= 0xDBFF)
					{
						i++;
						output++;
					}
					output +=3;
				}
				else if (charCode > 0x7F)
					output +=2;
				else
					output++;
			}
			return output;
		}

		/**
	 * Takes a String and writes it into an array as UTF8 encoded bytes.
	 * @private
	 */
		function stringToUTF8(input, output, start) {
			var pos = start;
			for (var i = 0; i<input.length; i++) {
				var charCode = input.charCodeAt(i);

				// Check for a surrogate pair.
				if (0xD800 <= charCode && charCode <= 0xDBFF) {
					var lowCharCode = input.charCodeAt(++i);
					if (isNaN(lowCharCode)) {
						throw new Error(format(ERROR.MALFORMED_UNICODE, [charCode, lowCharCode]));
					}
	
