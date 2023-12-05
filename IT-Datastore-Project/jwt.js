const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require('jwks-rsa');
require('dotenv').config()
const DOMAIN = process.env.DOMAIN;

module.exports.checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  });
