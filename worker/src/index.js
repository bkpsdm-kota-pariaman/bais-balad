var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
__name(concat, "concat");
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");

// node_modules/jose/dist/webapi/lib/base64.js
function encodeBase64(input) {
  if (Uint8Array.prototype.toBase64) {
    return input.toBase64();
  }
  const CHUNK_SIZE = 32768;
  const arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(arr.join(""));
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
__name(decodeBase64, "decodeBase64");

// node_modules/jose/dist/webapi/util/base64url.js
function decode(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
__name(decode, "decode");
function encode2(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(encode2, "encode");

// node_modules/jose/dist/webapi/lib/crypto_key.js
var unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
var isAlgorithm = /* @__PURE__ */ __name((algorithm, name) => algorithm.name === name, "isAlgorithm");
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
__name(getHashLength, "getHashLength");
function checkHashLength(algorithm, expected) {
  const actual = getHashLength(algorithm.hash);
  if (actual !== expected)
    throw unusable(`SHA-${expected}`, "algorithm.hash");
}
__name(checkHashLength, "checkHashLength");
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
__name(getNamedCurve, "getNamedCurve");
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
__name(checkUsage, "checkUsage");
function checkSigCryptoKey(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm(key.algorithm, alg))
        throw unusable(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usage);
}
__name(checkSigCryptoKey, "checkSigCryptoKey");

// node_modules/jose/dist/webapi/lib/invalid_key_input.js
function message(msg, actual, ...types) {
  types = types.filter(Boolean);
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
__name(message, "message");
var invalidKeyInput = /* @__PURE__ */ __name((actual, ...types) => message("Key must be ", actual, ...types), "invalidKeyInput");
var withAlg = /* @__PURE__ */ __name((alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types), "withAlg");

// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static {
    __name(this, "JWTExpired");
  }
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/jose/dist/webapi/lib/is_key_like.js
var isCryptoKey = /* @__PURE__ */ __name((key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike = /* @__PURE__ */ __name((key) => isCryptoKey(key) || isKeyObject(key), "isKeyLike");

// node_modules/jose/dist/webapi/lib/helpers.js
function assertNotSet(value, name) {
  if (value) {
    throw new TypeError(`${name} can only be called once`);
  }
}
__name(assertNotSet, "assertNotSet");
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
__name(decodeBase64url, "decodeBase64url");

// node_modules/jose/dist/webapi/lib/type_checks.js
var isObjectLike = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null, "isObjectLike");
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
__name(isObject, "isObject");
function isDisjoint(...headers) {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}
__name(isDisjoint, "isDisjoint");
var isJWK = /* @__PURE__ */ __name((key) => isObject(key) && typeof key.kty === "string", "isJWK");
var isPrivateJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string"), "isPrivateJWK");
var isPublicJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0, "isPublicJWK");
var isSecretJWK = /* @__PURE__ */ __name((key) => key.kty === "oct" && typeof key.k === "string", "isSecretJWK");

// node_modules/jose/dist/webapi/lib/signing.js
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
__name(checkKeyLength, "checkKeyLength");
function subtleAlgorithm(alg, algorithm) {
  const hash = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash, name: "RSA-PSS", saltLength: parseInt(alg.slice(-3), 10) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
    case "EdDSA":
      return { name: "Ed25519" };
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return { name: alg };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
__name(subtleAlgorithm, "subtleAlgorithm");
async function getSigKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey(key, alg, usage);
  return key;
}
__name(getSigKey, "getSigKey");
async function sign(alg, key, data) {
  const cryptoKey = await getSigKey(alg, key, "sign");
  checkKeyLength(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
__name(sign, "sign");
async function verify(alg, key, signature, data) {
  const cryptoKey = await getSigKey(alg, key, "verify");
  checkKeyLength(alg, cryptoKey);
  const algorithm = subtleAlgorithm(alg, cryptoKey.algorithm);
  try {
    return await crypto.subtle.verify(algorithm, cryptoKey, signature, data);
  } catch {
    return false;
  }
}
__name(verify, "verify");

// node_modules/jose/dist/webapi/lib/jwk_to_key.js
var unsupportedAlg = 'Invalid or unsupported JWK "alg" (Algorithm) Parameter value';
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "AKP": {
      switch (jwk.alg) {
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: jwk.alg };
          keyUsages = jwk.priv ? ["sign"] : ["verify"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
        case "ES384":
        case "ES512":
          algorithm = {
            name: "ECDSA",
            namedCurve: { ES256: "P-256", ES384: "P-384", ES512: "P-521" }[jwk.alg]
          };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
__name(subtleMapping, "subtleMapping");
async function jwkToKey(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
__name(jwkToKey, "jwkToKey");

// node_modules/jose/dist/webapi/lib/normalize_key.js
var unusableForAlg = "given KeyObject instance cannot be used for this algorithm";
var cache;
var handleJWK = /* @__PURE__ */ __name(async (key, jwk, alg, freeze = false) => {
  cache ||= /* @__PURE__ */ new WeakMap();
  let cached = cache.get(key);
  if (cached?.[alg]) {
    return cached[alg];
  }
  const cryptoKey = await jwkToKey({ ...jwk, alg });
  if (freeze)
    Object.freeze(key);
  if (!cached) {
    cache.set(key, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleJWK");
var handleKeyObject = /* @__PURE__ */ __name((keyObject, alg) => {
  cache ||= /* @__PURE__ */ new WeakMap();
  let cached = cache.get(keyObject);
  if (cached?.[alg]) {
    return cached[alg];
  }
  const isPublic = keyObject.type === "public";
  const extractable = isPublic ? true : false;
  let cryptoKey;
  if (keyObject.asymmetricKeyType === "x25519") {
    switch (alg) {
      case "ECDH-ES":
      case "ECDH-ES+A128KW":
      case "ECDH-ES+A192KW":
      case "ECDH-ES+A256KW":
        break;
      default:
        throw new TypeError(unusableForAlg);
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
  }
  if (keyObject.asymmetricKeyType === "ed25519") {
    if (alg !== "EdDSA" && alg !== "Ed25519") {
      throw new TypeError(unusableForAlg);
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
      isPublic ? "verify" : "sign"
    ]);
  }
  switch (keyObject.asymmetricKeyType) {
    case "ml-dsa-44":
    case "ml-dsa-65":
    case "ml-dsa-87": {
      if (alg !== keyObject.asymmetricKeyType.toUpperCase()) {
        throw new TypeError(unusableForAlg);
      }
      cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
        isPublic ? "verify" : "sign"
      ]);
    }
  }
  if (keyObject.asymmetricKeyType === "rsa") {
    let hash;
    switch (alg) {
      case "RSA-OAEP":
        hash = "SHA-1";
        break;
      case "RS256":
      case "PS256":
      case "RSA-OAEP-256":
        hash = "SHA-256";
        break;
      case "RS384":
      case "PS384":
      case "RSA-OAEP-384":
        hash = "SHA-384";
        break;
      case "RS512":
      case "PS512":
      case "RSA-OAEP-512":
        hash = "SHA-512";
        break;
      default:
        throw new TypeError(unusableForAlg);
    }
    if (alg.startsWith("RSA-OAEP")) {
      return keyObject.toCryptoKey({
        name: "RSA-OAEP",
        hash
      }, extractable, isPublic ? ["encrypt"] : ["decrypt"]);
    }
    cryptoKey = keyObject.toCryptoKey({
      name: alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
      hash
    }, extractable, [isPublic ? "verify" : "sign"]);
  }
  if (keyObject.asymmetricKeyType === "ec") {
    const nist = /* @__PURE__ */ new Map([
      ["prime256v1", "P-256"],
      ["secp384r1", "P-384"],
      ["secp521r1", "P-521"]
    ]);
    const namedCurve = nist.get(keyObject.asymmetricKeyDetails?.namedCurve);
    if (!namedCurve) {
      throw new TypeError(unusableForAlg);
    }
    const expectedCurve = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
    if (expectedCurve[alg] && namedCurve === expectedCurve[alg]) {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg.startsWith("ECDH-ES")) {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDH",
        namedCurve
      }, extractable, isPublic ? [] : ["deriveBits"]);
    }
  }
  if (!cryptoKey) {
    throw new TypeError(unusableForAlg);
  }
  if (!cached) {
    cache.set(keyObject, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleKeyObject");
async function normalizeKey(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey(key)) {
    return key;
  }
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK(key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k) {
      return decode(key.k);
    }
    return handleJWK(key, key, alg, true);
  }
  throw new Error("unreachable");
}
__name(normalizeKey, "normalizeKey");

// node_modules/jose/dist/webapi/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
__name(validateCrit, "validateCrit");

// node_modules/jose/dist/webapi/lib/validate_algorithms.js
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}
__name(validateAlgorithms, "validateAlgorithms");

// node_modules/jose/dist/webapi/lib/check_key_type.js
var tag = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((alg, key, usage) => {
  if (key.use !== void 0) {
    let expected;
    switch (usage) {
      case "sign":
      case "verify":
        expected = "sig";
        break;
      case "encrypt":
      case "decrypt":
        expected = "enc";
        break;
    }
    if (key.use !== expected) {
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
    }
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  }
  if (Array.isArray(key.key_ops)) {
    let expectedKeyOp;
    switch (true) {
      case (usage === "sign" || usage === "verify"):
      case alg === "dir":
      case alg.includes("CBC-HS"):
        expectedKeyOp = usage;
        break;
      case alg.startsWith("PBES2"):
        expectedKeyOp = "deriveBits";
        break;
      case /^A\d{3}(?:GCM)?(?:KW)?$/.test(alg):
        if (!alg.includes("GCM") && alg.endsWith("KW")) {
          expectedKeyOp = usage === "encrypt" ? "wrapKey" : "unwrapKey";
        } else {
          expectedKeyOp = usage;
        }
        break;
      case (usage === "encrypt" && alg.startsWith("RSA")):
        expectedKeyOp = "wrapKey";
        break;
      case usage === "decrypt":
        expectedKeyOp = alg.startsWith("RSA") ? "unwrapKey" : "deriveBits";
        break;
    }
    if (expectedKeyOp && key.key_ops?.includes?.(expectedKeyOp) === false) {
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
    }
  }
  return true;
}, "jwkMatchesOp");
var symmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
  if (key instanceof Uint8Array)
    return;
  if (isJWK(key)) {
    if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
  }
}, "symmetricTypeCheck");
var asymmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
  if (isJWK(key)) {
    switch (usage) {
      case "decrypt":
      case "sign":
        if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
      case "encrypt":
      case "verify":
        if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
    }
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (key.type === "public") {
    switch (usage) {
      case "sign":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
      case "decrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
  }
  if (key.type === "private") {
    switch (usage) {
      case "verify":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
      case "encrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
  }
}, "asymmetricTypeCheck");
function checkKeyType(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck(alg, key, usage);
  }
}
__name(checkKeyType, "checkKeyType");

// node_modules/jose/dist/webapi/jws/flattened/verify.js
async function flattenedVerify(jws, key, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!isDisjoint(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validateAlgorithms("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
  }
  checkKeyType(alg, key, "verify");
  const data = concat(jws.protected !== void 0 ? encode(jws.protected) : new Uint8Array(), encode("."), typeof jws.payload === "string" ? b64 ? encode(jws.payload) : encoder.encode(jws.payload) : jws.payload);
  const signature = decodeBase64url(jws.signature, "signature", JWSInvalid);
  const k = await normalizeKey(key, alg);
  const verified = await verify(alg, k, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    payload = decodeBase64url(jws.payload, "payload", JWSInvalid);
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key: k };
  }
  return result;
}
__name(flattenedVerify, "flattenedVerify");

// node_modules/jose/dist/webapi/jws/compact/verify.js
async function compactVerify(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(compactVerify, "compactVerify");

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
var minute = 60;
var hour = minute * 60;
var day = hour * 24;
var week = day * 7;
var year = day * 365.25;
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
function secs(str) {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
__name(secs, "secs");
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
__name(validateInput, "validateInput");
var normalizeTyp = /* @__PURE__ */ __name((value) => {
  if (value.includes("/")) {
    return value.toLowerCase();
  }
  return `application/${value.toLowerCase()}`;
}, "normalizeTyp");
var checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => {
  if (typeof audPayload === "string") {
    return audOption.includes(audPayload);
  }
  if (Array.isArray(audPayload)) {
    return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
  }
  return false;
}, "checkAudiencePresence");
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload)) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
  }
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
  const presenceCheck = [...requiredClaims];
  if (maxTokenAge !== void 0)
    presenceCheck.push("iat");
  if (audience !== void 0)
    presenceCheck.push("aud");
  if (subject !== void 0)
    presenceCheck.push("sub");
  if (issuer !== void 0)
    presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse())) {
    if (!(claim in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs(options.clockTolerance);
      break;
    case "number":
      tolerance = options.clockTolerance;
      break;
    case "undefined":
      tolerance = 0;
      break;
    default:
      throw new TypeError("Invalid clockTolerance option type");
  }
  const { currentDate } = options;
  const now = epoch(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max = typeof maxTokenAge === "number" ? maxTokenAge : secs(maxTokenAge);
    if (age - tolerance > max) {
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
}
__name(validateClaimsSet, "validateClaimsSet");
var JWTClaimsBuilder = class {
  static {
    __name(this, "JWTClaimsBuilder");
  }
  #payload;
  constructor(payload) {
    if (!isObject(payload)) {
      throw new TypeError("JWT Claims Set MUST be an object");
    }
    this.#payload = structuredClone(payload);
  }
  data() {
    return encoder.encode(JSON.stringify(this.#payload));
  }
  get iss() {
    return this.#payload.iss;
  }
  set iss(value) {
    this.#payload.iss = value;
  }
  get sub() {
    return this.#payload.sub;
  }
  set sub(value) {
    this.#payload.sub = value;
  }
  get aud() {
    return this.#payload.aud;
  }
  set aud(value) {
    this.#payload.aud = value;
  }
  set jti(value) {
    this.#payload.jti = value;
  }
  set nbf(value) {
    if (typeof value === "number") {
      this.#payload.nbf = validateInput("setNotBefore", value);
    } else if (value instanceof Date) {
      this.#payload.nbf = validateInput("setNotBefore", epoch(value));
    } else {
      this.#payload.nbf = epoch(/* @__PURE__ */ new Date()) + secs(value);
    }
  }
  set exp(value) {
    if (typeof value === "number") {
      this.#payload.exp = validateInput("setExpirationTime", value);
    } else if (value instanceof Date) {
      this.#payload.exp = validateInput("setExpirationTime", epoch(value));
    } else {
      this.#payload.exp = epoch(/* @__PURE__ */ new Date()) + secs(value);
    }
  }
  set iat(value) {
    if (value === void 0) {
      this.#payload.iat = epoch(/* @__PURE__ */ new Date());
    } else if (value instanceof Date) {
      this.#payload.iat = validateInput("setIssuedAt", epoch(value));
    } else if (typeof value === "string") {
      this.#payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
    } else {
      this.#payload.iat = validateInput("setIssuedAt", value);
    }
  }
};

// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const verified = await compactVerify(jwt, key, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(jwtVerify, "jwtVerify");

// node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign = class {
  static {
    __name(this, "FlattenedSign");
  }
  #payload;
  #protectedHeader;
  #unprotectedHeader;
  constructor(payload) {
    if (!(payload instanceof Uint8Array)) {
      throw new TypeError("payload must be an instance of Uint8Array");
    }
    this.#payload = payload;
  }
  setProtectedHeader(protectedHeader) {
    assertNotSet(this.#protectedHeader, "setProtectedHeader");
    this.#protectedHeader = protectedHeader;
    return this;
  }
  setUnprotectedHeader(unprotectedHeader) {
    assertNotSet(this.#unprotectedHeader, "setUnprotectedHeader");
    this.#unprotectedHeader = unprotectedHeader;
    return this;
  }
  async sign(key, options) {
    if (!this.#protectedHeader && !this.#unprotectedHeader) {
      throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
    }
    if (!isDisjoint(this.#protectedHeader, this.#unprotectedHeader)) {
      throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
    }
    const joseHeader = {
      ...this.#protectedHeader,
      ...this.#unprotectedHeader
    };
    const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this.#protectedHeader, joseHeader);
    let b64 = true;
    if (extensions.has("b64")) {
      b64 = this.#protectedHeader.b64;
      if (typeof b64 !== "boolean") {
        throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
      }
    }
    const { alg } = joseHeader;
    if (typeof alg !== "string" || !alg) {
      throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
    }
    checkKeyType(alg, key, "sign");
    let payloadS;
    let payloadB;
    if (b64) {
      payloadS = encode2(this.#payload);
      payloadB = encode(payloadS);
    } else {
      payloadB = this.#payload;
      payloadS = "";
    }
    let protectedHeaderString;
    let protectedHeaderBytes;
    if (this.#protectedHeader) {
      protectedHeaderString = encode2(JSON.stringify(this.#protectedHeader));
      protectedHeaderBytes = encode(protectedHeaderString);
    } else {
      protectedHeaderString = "";
      protectedHeaderBytes = new Uint8Array();
    }
    const data = concat(protectedHeaderBytes, encode("."), payloadB);
    const k = await normalizeKey(key, alg);
    const signature = await sign(alg, k, data);
    const jws = {
      signature: encode2(signature),
      payload: payloadS
    };
    if (this.#unprotectedHeader) {
      jws.header = this.#unprotectedHeader;
    }
    if (this.#protectedHeader) {
      jws.protected = protectedHeaderString;
    }
    return jws;
  }
};

// node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign = class {
  static {
    __name(this, "CompactSign");
  }
  #flattened;
  constructor(payload) {
    this.#flattened = new FlattenedSign(payload);
  }
  setProtectedHeader(protectedHeader) {
    this.#flattened.setProtectedHeader(protectedHeader);
    return this;
  }
  async sign(key, options) {
    const jws = await this.#flattened.sign(key, options);
    if (jws.payload === void 0) {
      throw new TypeError("use the flattened module for creating JWS with b64: false");
    }
    return `${jws.protected}.${jws.payload}.${jws.signature}`;
  }
};

// node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT = class {
  static {
    __name(this, "SignJWT");
  }
  #protectedHeader;
  #jwt;
  constructor(payload = {}) {
    this.#jwt = new JWTClaimsBuilder(payload);
  }
  setIssuer(issuer) {
    this.#jwt.iss = issuer;
    return this;
  }
  setSubject(subject) {
    this.#jwt.sub = subject;
    return this;
  }
  setAudience(audience) {
    this.#jwt.aud = audience;
    return this;
  }
  setJti(jwtId) {
    this.#jwt.jti = jwtId;
    return this;
  }
  setNotBefore(input) {
    this.#jwt.nbf = input;
    return this;
  }
  setExpirationTime(input) {
    this.#jwt.exp = input;
    return this;
  }
  setIssuedAt(input) {
    this.#jwt.iat = input;
    return this;
  }
  setProtectedHeader(protectedHeader) {
    this.#protectedHeader = protectedHeader;
    return this;
  }
  async sign(key, options) {
    const sig = new CompactSign(this.#jwt.data());
    sig.setProtectedHeader(this.#protectedHeader);
    if (Array.isArray(this.#protectedHeader?.crit) && this.#protectedHeader.crit.includes("b64") && this.#protectedHeader.b64 === false) {
      throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
    }
    return sig.sign(key, options);
  }
};

// src/index.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type"
};
var index_default = {
  /**
   * Fetch handler: Berperan sebagai PRODUCER untuk queue.
   * Menerima request absensi awal dari perangkat pengguna.
   * @param {Request} request
   * @param {object} env
   * @param {ExecutionContext} ctx
   * @returns {Response}
   */
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname.endsWith("/api/login-asn")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!env.PEGAWAI_KV || !env.JWT_SECRET || !env.ORIGIN_API_URL || !env.WORKER_SECRET) {
        console.error("Konfigurasi worker tidak lengkap. 'PEGAWAI_KV', 'JWT_SECRET', 'ORIGIN_API_URL', 'WORKER_SECRET' harus diatur.");
        return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const requestClone = request.clone();
        const { nip, nik } = await request.json();
        if (!nip || !nik) {
          return new Response(JSON.stringify({ status: false, code: 400, message: "NIP dan NIK wajib diisi" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        const kvKey = `pegawai:${nip}`;
        const cachedPegawai = await env.PEGAWAI_KV.get(kvKey, "json");
        if (cachedPegawai) {
          if (cachedPegawai.nik === nik) {
            console.log(`[Login Cache] Cache HIT for NIP: ${nip}`);
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            const issuedAt = Math.floor(Date.now() / 1e3);
            const expirationTime = issuedAt + 3600 * 24 * 30;
            const payload = {
              data: {
                nip: cachedPegawai.nip,
                nama: cachedPegawai.nama_pegawai,
                opd: cachedPegawai.perangkat_daerah,
                jabatan: cachedPegawai.jabatan,
                role: cachedPegawai.role || ["asn"],
                jenis_asn: cachedPegawai.jenis_asn
              }
            };
            const jwtToken = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt(issuedAt).setExpirationTime(expirationTime).setIssuer("bais-balad-apps").sign(secret);
            const responseData = { token: jwtToken, user: { nama: cachedPegawai.nama_pegawai, jabatan: cachedPegawai.jabatan, opd: cachedPegawai.perangkat_daerah } };
            return new Response(JSON.stringify({ status: true, code: 200, message: "Login Berhasil (dari Cache)", data: responseData }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
          } else {
            console.log(`[Login Cache] NIK mismatch for NIP: ${nip}. Treating as Cache MISS.`);
          }
        }
        console.log(`[Login Cache] Cache MISS or NIK mismatch for NIP: ${nip}. Returning 404 to PWA.`);
        return new Response(JSON.stringify({ status: false, code: 404, message: "Data login tidak ditemukan di cache. Mencoba ke server utama." }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        console.error("Error di login handler worker:", error.message, error.stack);
        return new Response(JSON.stringify({ status: false, code: 500, message: "Server worker error: Gagal memproses login." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    const jadwalByKodeMatch = pathname.match(/^\/api\/jadwal-by-kode\/([a-zA-Z0-9_.-]+)\/?$/);
    if (jadwalByKodeMatch && request.method === "GET") {
      if (!env.JADWAL_KV) {
        console.error("Konfigurasi worker tidak lengkap. 'JADWAL_KV' harus diatur.");
        return new Response(JSON.stringify({ status: false, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const kodeAkses = jadwalByKodeMatch[1];
      const kvKey = `jadwal:${kodeAkses}`;
      const cachedJadwal = await env.JADWAL_KV.get(kvKey, "json");
      if (cachedJadwal) {
        const todayYMD = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
        if (cachedJadwal.tanggal !== todayYMD) {
          return new Response(JSON.stringify({ status: false, message: "Jadwal ini tidak berlaku untuk hari ini." }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
              "Cache-Control": "no-store"
              // Jangan cache respons error ini
            }
          });
        }
        const now = /* @__PURE__ */ new Date();
        const startTime = /* @__PURE__ */ new Date(`${cachedJadwal.tanggal}T${cachedJadwal.jam_mulai}+07:00`);
        if (now < startTime) {
          return new Response(JSON.stringify({ status: false, message: `Absensi untuk kegiatan ini belum dibuka. Silakan coba lagi pada atau setelah pukul ${cachedJadwal.jam_mulai} WIB.` }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
              "Cache-Control": "no-store"
              // Jangan cache respons error ini
            }
          });
        }
        return new Response(JSON.stringify({ status: true, message: "Jadwal ditemukan di cache.", data: cachedJadwal }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
          }
        });
      } else {
        return new Response(JSON.stringify({ status: false, message: "Jadwal tidak ditemukan di cache." }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders, "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
        });
      }
    }
    if (pathname.endsWith("/api/opd/list")) {
      if (!env.OPD_KV) {
        console.error("Konfigurasi worker tidak lengkap. 'OPD_KV' harus diatur.");
        return new Response(JSON.stringify({ status: false, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const cachedOpdList = await env.OPD_KV.get("opd_list", "json");
      if (cachedOpdList) {
        console.log("[OPD Cache] Cache HIT for opd_list.");
        return new Response(JSON.stringify({ status: true, message: "Daftar OPD dari cache.", data: cachedOpdList }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } else {
        console.log("[OPD Cache] Cache MISS for opd_list. Returning 404 to PWA.");
        return new Response(JSON.stringify({ status: false, message: "Daftar OPD tidak ditemukan di cache." }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    if (pathname.endsWith("/api/opd-list/sync") && request.method === "PUT") {
      if (!env.OPD_KV || !env.WORKER_SECRET) {
        return new Response(JSON.stringify({ status: false, message: "Konfigurasi worker tidak lengkap (OPD_KV, WORKER_SECRET)." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (request.headers.get("X-Worker-Secret") !== env.WORKER_SECRET) {
        return new Response(JSON.stringify({ status: false, message: "Akses ditolak." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const opdList = await request.json();
      await env.OPD_KV.put("opd_list", JSON.stringify(opdList));
      return new Response(JSON.stringify({ status: true, message: "Daftar OPD berhasil disinkronkan ke KV." }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const jadwalMatch = pathname.match(/^\/api\/jadwal\/?([a-zA-Z0-9_.-]+)?\/?$/);
    if (jadwalMatch) {
      if (!env.JADWAL_KV || !env.WORKER_SECRET) {
        console.error("Konfigurasi worker tidak lengkap. 'JADWAL_KV' dan 'WORKER_SECRET' harus diatur.");
        return new Response(JSON.stringify({ status: false, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const requestSecret = request.headers.get("X-Worker-Secret");
      if (requestSecret !== env.WORKER_SECRET) {
        return new Response(JSON.stringify({ status: false, message: "Akses ditolak. Invalid secret." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const kodeAkses = jadwalMatch[1];
      if (request.method === "POST" || request.method === "PUT") {
        try {
          const jadwalData = await request.json();
          const effectiveKodeAkses = kodeAkses || jadwalData.kode_akses;
          if (!effectiveKodeAkses) {
            return new Response(JSON.stringify({ status: false, message: "Kode akses tidak ditemukan di URL atau payload." }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
          }
          const kvKey = `jadwal:${effectiveKodeAkses}`;
          await env.JADWAL_KV.put(kvKey, JSON.stringify(jadwalData));
          return new Response(JSON.stringify({ status: true, message: `Jadwal ${effectiveKodeAkses} berhasil disimpan/diperbarui di cache.` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e) {
          console.error(`[KV JADWAL PUT Error] Gagal menyimpan jadwal:`, e);
          const status = e instanceof SyntaxError ? 400 : 503;
          const message2 = status === 400 ? `Gagal memproses request: ${e.message}` : `Gagal menyimpan data jadwal ke KV. Error: ${e.message}`;
          return new Response(JSON.stringify({ status: false, message: message2 }), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      if (request.method === "DELETE" && kodeAkses) {
        try {
          const kvKey = `jadwal:${kodeAkses}`;
          await env.JADWAL_KV.delete(kvKey);
          return new Response(JSON.stringify({ status: true, message: `Jadwal ${kodeAkses} berhasil dihapus dari cache.` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e) {
          console.error(`[KV JADWAL DELETE Error] Gagal menghapus jadwal ${kodeAkses}:`, e);
          return new Response(JSON.stringify({ status: false, message: `Gagal menghapus data jadwal dari KV. Error: ${e.message}` }), { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      return new Response(JSON.stringify({ status: false, message: "Metode tidak valid untuk rute /api/jadwal." }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (pathname.endsWith("/api/profil/refresh-token")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ status: false, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const token = authHeader.substring(7);
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      let decodedToken;
      try {
        const { payload } = await jwtVerify(token, secret, { issuer: "bais-balad-apps" });
        decodedToken = payload;
      } catch (err) {
        return new Response(JSON.stringify({ status: false, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const nip = decodedToken.data.nip;
        const kvKey = `pegawai:${nip}`;
        const profilKv = await env.PEGAWAI_KV.get(kvKey, "json");
        if (profilKv) {
          console.log(`[Profil Refresh Token] Cache HIT untuk NIP ${nip}. Membuat token baru.`);
          const issuedAt = Math.floor(Date.now() / 1e3);
          const expirationTime = issuedAt + 3600 * 24 * 30;
          const payload = {
            data: {
              nip: profilKv.nip,
              nama: profilKv.nama_pegawai,
              opd: profilKv.perangkat_daerah,
              jabatan: profilKv.jabatan,
              role: profilKv.role || ["asn"],
              jenis_asn: profilKv.jenis_asn
            }
          };
          const newJwt = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt(issuedAt).setExpirationTime(expirationTime).setIssuer("bais-balad-apps").sign(secret);
          const responseData = {
            token: newJwt
          };
          return new Response(JSON.stringify({
            status: true,
            message: "Token berhasil diperbarui dari cache.",
            data: responseData
          }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        console.log(`[Profil Refresh Token] Cache MISS untuk NIP ${nip}. Memanggil PHP.`);
        const phpResponse = await fetch(`${env.ORIGIN_API_URL}/profil/refresh-token`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
        const phpResult = await phpResponse.json();
        return new Response(JSON.stringify(phpResult), { status: phpResponse.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        console.error("Error di worker /api/profil/refresh-token:", error.message, error.stack);
        return new Response(JSON.stringify({ status: false, message: "Server worker error: Gagal memperbarui token." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    if (pathname.endsWith("/api/profil/sync")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ status: false, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const token = authHeader.substring(7);
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      let decodedToken;
      try {
        const { payload } = await jwtVerify(token, secret, { issuer: "bais-balad-apps" });
        decodedToken = payload;
      } catch (err) {
        console.error(`[Profil Refresh Token] Gagal validasi token: ${err.message}`);
        return new Response(JSON.stringify({ status: false, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const nip = decodedToken.data.nip;
        const kvKey = `pegawai:${nip}`;
        const profilKv = await env.PEGAWAI_KV.get(kvKey, "json");
        if (profilKv) {
          console.log(`[Profil Sync] Cache HIT untuk NIP ${nip}. Membuat token baru dari data KV.`);
          const issuedAt = Math.floor(Date.now() / 1e3);
          const expirationTime = issuedAt + 3600 * 24 * 30;
          const payload = {
            data: {
              nip: profilKv.nip,
              nama: profilKv.nama_pegawai,
              opd: profilKv.perangkat_daerah,
              jabatan: profilKv.jabatan,
              role: profilKv.role || ["asn"],
              jenis_asn: profilKv.jenis_asn
            }
          };
          const newJwt = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt(issuedAt).setExpirationTime(expirationTime).setIssuer("bais-balad-apps").sign(secret);
          const responseData = {
            token: newJwt,
            user: {
              nama: profilKv.nama_pegawai,
              jabatan: profilKv.jabatan,
              opd: profilKv.perangkat_daerah
            }
          };
          return new Response(JSON.stringify({
            status: true,
            message: "Profil berhasil disinkronkan dari cache.",
            data: responseData
          }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        console.log(`[Profil Sync] Cache MISS untuk NIP ${nip}. Memanggil PHP untuk sinkronisasi.`);
        const cacheBuster = `?v=${Date.now()}`;
        const phpResponse = await fetch(`${env.ORIGIN_API_URL}/profil/refresh${cacheBuster}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${token}` }
        });
        const phpResult = await phpResponse.json();
        if (phpResponse.ok && phpResult.status && phpResult.data.pegawai_to_cache) {
          ctx.waitUntil(env.PEGAWAI_KV.put(kvKey, JSON.stringify(phpResult.data.pegawai_to_cache)));
          delete phpResult.data.pegawai_to_cache;
        }
        return new Response(JSON.stringify(phpResult), { status: phpResponse.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        console.error("Error di worker /api/profil/sync:", error.message, error.stack);
        return new Response(JSON.stringify({ status: false, message: "Server worker error: Gagal memproses sinkronisasi profil." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    if (pathname.endsWith("/api/token/generate-temporary")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!env.JWT_SECRET) {
        console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
        return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const token = authHeader.substring(7);
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      let decodedToken;
      try {
        const { payload } = await jwtVerify(token, secret, { issuer: "bais-balad-apps" });
        decodedToken = payload;
      } catch (err) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const issuedAt = Math.floor(Date.now() / 1e3);
        const expirationTime = issuedAt + 180;
        const pegawaiData = decodedToken.data;
        const tempPayload = {
          data: {
            nip: pegawaiData.nip,
            nama: pegawaiData.nama,
            opd: pegawaiData.opd,
            jabatan: pegawaiData.jabatan,
            role: pegawaiData.role || ["asn"],
            jenis_asn: pegawaiData.jenis_asn
          }
        };
        const tempJwt = await new SignJWT(tempPayload).setProtectedHeader({ alg: "HS256" }).setExpirationTime(expirationTime).sign(secret);
        const prefixedToken = "BB:" + tempJwt;
        return new Response(JSON.stringify({
          status: true,
          code: 200,
          message: "Token sementara berhasil dibuat via worker",
          data: { token: prefixedToken }
        }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        console.error("Error di worker /api/token/generate-temporary:", error.message, error.stack);
        return new Response(JSON.stringify({ status: false, message: "Server worker error: Gagal membuat token sementara." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    const pegawaiMatch = pathname.match(/^\/api\/pegawai\/(\d{18})$/);
    if (pegawaiMatch) {
      if (!env.PEGAWAI_KV || !env.WORKER_SECRET) {
        console.error("CRUD Pegawai Error: PEGAWAI_KV or WORKER_SECRET not configured.");
        return new Response("Konfigurasi worker tidak lengkap.", { status: 500, headers: corsHeaders });
      }
      const requestSecret = request.headers.get("X-Worker-Secret");
      if (requestSecret !== env.WORKER_SECRET) {
        return new Response("Akses ditolak. Invalid secret.", { status: 403, headers: corsHeaders });
      }
      const nip = pegawaiMatch[1];
      const kvKey = `pegawai:${nip}`;
      if (request.method === "PUT") {
        try {
          const pegawaiData = await request.json();
          await env.PEGAWAI_KV.put(kvKey, JSON.stringify(pegawaiData));
          return new Response(JSON.stringify({ status: true, message: `Cache untuk NIP ${nip} berhasil disimpan/diperbarui.` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e) {
          console.error(`[KV PEGAWAI PUT Error] Gagal menyimpan NIP ${nip}:`, e);
          const status = e instanceof SyntaxError ? 400 : 503;
          const message2 = status === 400 ? `Gagal memproses request: ${e.message}` : `Gagal menyimpan data ke KV. Error: ${e.message}`;
          return new Response(JSON.stringify({ status: false, message: message2 }), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      if (request.method === "DELETE") {
        try {
          await env.PEGAWAI_KV.delete(kvKey);
          return new Response(JSON.stringify({ status: true, message: `Cache untuk NIP ${nip} berhasil dihapus.` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e) {
          console.error(`[KV PEGAWAI DELETE Error] Gagal menghapus NIP ${nip}:`, e);
          return new Response(JSON.stringify({ status: false, message: `Gagal menghapus data dari KV. Error: ${e.message}` }), { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      return new Response(JSON.stringify({ status: false, message: "Metode tidak valid untuk rute /api/pegawai." }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (pathname.endsWith("/api/pegawai/bulk")) {
      if (!env.PEGAWAI_KV || !env.WORKER_SECRET) {
        console.error("Bulk Update Pegawai Error: PEGAWAI_KV or WORKER_SECRET not configured.");
        return new Response("Konfigurasi worker tidak lengkap.", { status: 500, headers: corsHeaders });
      }
      const requestSecret = request.headers.get("X-Worker-Secret");
      if (requestSecret !== env.WORKER_SECRET) {
        return new Response("Akses ditolak. Invalid secret.", { status: 403, headers: corsHeaders });
      }
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, message: "Metode tidak valid untuk rute /api/pegawai/bulk. Gunakan POST." }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const pegawaiList = await request.json();
        if (!Array.isArray(pegawaiList)) {
          return new Response(JSON.stringify({ status: false, message: "Payload harus berupa array data pegawai." }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        const bulkPutPromises = pegawaiList.filter((p) => p && p.nip).map((pegawaiData) => {
          const kvKey = `pegawai:${pegawaiData.nip}`;
          return env.PEGAWAI_KV.put(kvKey, JSON.stringify(pegawaiData));
        });
        await Promise.all(bulkPutPromises);
        return new Response(JSON.stringify({ status: true, message: `${pegawaiList.length} data pegawai berhasil disinkronkan.` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) {
        console.error(`[KV PEGAWAI BULK PUT Error] Gagal menyimpan batch:`, e);
        return new Response(JSON.stringify({ status: false, message: `Gagal menyimpan sebagian atau semua data ke KV. Error: ${e.message}` }), { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    if (pathname.endsWith("/api/test-kv")) {
      if (!env.PEGAWAI_KV) {
        return new Response("KV Namespace 'PEGAWAI_KV' tidak terkonfigurasi.", { status: 500 });
      }
      if (request.method === "POST") {
        try {
          const { key, value } = await request.json();
          ctx.waitUntil(env.PEGAWAI_KV.put(key, JSON.stringify(value)));
          return new Response(`OK. Data untuk kunci '${key}' sedang disimpan.`, { headers: corsHeaders });
        } catch (e) {
          return new Response(`Gagal memproses request: ${e.message}`, { status: 400, headers: corsHeaders });
        }
      }
      if (request.method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) {
          return new Response("Parameter 'key' dibutuhkan.", { status: 400, headers: corsHeaders });
        }
        const value = await env.PEGAWAI_KV.get(key, "json");
        if (value) {
          return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        } else {
          return new Response(JSON.stringify({ message: `Data untuk kunci '${key}' tidak ditemukan.` }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
      return new Response("Metode tidak diizinkan untuk /api/test-kv. Gunakan GET atau POST.", { status: 405, headers: corsHeaders });
    }
    if (pathname.endsWith("/api/absen-cepat/submit")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!env.JWT_SECRET) {
        console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
        return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi admin tidak ada atau format salah." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const adminToken = authHeader.substring(7);
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      let decodedPayload;
      try {
        const { payload } = await jwtVerify(adminToken, secret, { issuer: "bais-balad-apps" });
        decodedPayload = payload;
      } catch (err) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Token admin tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!decodedPayload || !decodedPayload.data || !decodedPayload.data.role || !decodedPayload.data.role.includes("admin")) {
        return new Response(JSON.stringify({ status: false, code: 403, message: "Akses ditolak. Hanya admin yang dapat menggunakan fitur ini." }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const payload = await request.json();
        const userToken = payload.user_token;
        if (!userToken) {
          return new Response(JSON.stringify({ status: false, code: 400, message: "Token pegawai yang diabsenkan tidak ada dalam request body." }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        delete payload.user_token;
        const queuePayload = { ...payload, jwt_token: userToken, submittedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await env.MY_QUEUE.send(queuePayload);
        return new Response(JSON.stringify({ status: true, code: 202, message: "Absensi Cepat telah diterima dan akan segera diproses." }), { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 202 });
      } catch (error) {
        console.error("Error di fetch handler (producer absen-cepat) worker:", error);
        return new Response(JSON.stringify({ status: false, code: 500, message: "Server worker error: Gagal memproses permintaan Absensi Cepat Anda." }), { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 });
      }
    }
    if (pathname.endsWith("/api/absen/submit")) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      if (!env.JWT_SECRET) {
        console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
        return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const token = authHeader.substring(7);
      const secret = new TextEncoder().encode(env.JWT_SECRET);
      try {
        await jwtVerify(token, secret, { issuer: "bais-balad-apps" });
      } catch (err) {
        return new Response(JSON.stringify({ status: false, code: 401, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      try {
        const payload = await request.json();
        const queuePayload = { ...payload, jwt_token: token, submittedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await env.MY_QUEUE.send(queuePayload);
        const responsePayload = {
          status: true,
          code: 202,
          message: "Absensi Anda telah diterima dan akan segera diproses.",
          data: { waktu: (/* @__PURE__ */ new Date()).toISOString() }
        };
        return new Response(JSON.stringify(responsePayload), { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 202 });
      } catch (error) {
        console.error("Error di fetch handler (producer) worker:", error);
        const errorPayload = { status: false, code: 500, message: "Server worker error: Gagal memproses permintaan Anda." };
        return new Response(JSON.stringify(errorPayload), { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 });
      }
    }
    return new Response(JSON.stringify({ status: false, code: 404, message: "Endpoint tidak ditemukan di worker." }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  },
  /**
   * Queue handler: Berperan sebagai CONSUMER.
   * Menerima pesan dari antrian dan meneruskannya ke server PHP origin.
   * @param {MessageBatch} batch
   * @param {object} env
   * @param {ExecutionContext} ctx
   */
  async queue(batch, env) {
    if (!env.ORIGIN_API_BULK_URL || !env.WORKER_SECRET) {
      console.error("Secrets 'ORIGIN_API_BULK_URL' and 'WORKER_SECRET' must be set for bulk processing.");
      batch.retryAll({ delaySeconds: 300 });
      return;
    }
    const messagesToSend = batch.messages.map((msg) => ({
      id: msg.id,
      body: msg.body
    }));
    if (messagesToSend.length === 0) {
      console.log("[Queue Consumer] Batch kosong, tidak ada yang diproses.");
      return;
    }
    console.log(`[Queue Consumer] Memproses batch berisi ${messagesToSend.length} pesan.`);
    try {
      const response = await fetch(env.ORIGIN_API_BULK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": env.WORKER_SECRET
        },
        body: JSON.stringify(messagesToSend),
        signal: AbortSignal.timeout(6e4)
        // Timeout lebih lama (60 detik) untuk proses bulk
      });
      if (response.ok) {
        const responseData = await response.json();
        console.log(`[Queue Consumer] Batch SUKSES. Respon server:`, responseData.message);
        if (responseData.errors && responseData.errors.length > 0) {
          console.error(`[Queue Consumer] Detail kegagalan dari server PHP:`, JSON.stringify(responseData.errors, null, 2));
        }
      } else {
        const errorText = await response.text();
        console.error(`[Queue Consumer] Batch GAGAL. Server merespon dengan status ${response.status}: ${errorText}. Data yang gagal: ${JSON.stringify(messagesToSend)}. Mencoba ulang seluruh batch...`);
        batch.retryAll({ delaySeconds: 120 });
      }
    } catch (error) {
      console.error(`[Queue Consumer] Error jaringan saat memproses batch:`, error, `Data yang gagal: ${JSON.stringify(messagesToSend)}`);
      batch.retryAll();
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
