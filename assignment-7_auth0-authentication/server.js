const express = require('express');
const app = express();

const json2html = require('json-to-html');

const {Datastore} = require('@google-cloud/datastore');

const bodyParser = require('body-parser');
const request = require('request');

const datastore = new Datastore();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const BOAT = "Boat";

const router = express.Router();
const owners = express.Router();
const login = express.Router();

require('dotenv').config()

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const DOMAIN = process.env.DOMAIN;

app.use(bodyParser.json());

function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}

const checkJwt = jwt({
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

/* ------------- Begin Boat Model Functions ------------- */

// Create a boat
async function post_boat(req){
    // Save boat with initial data from POST request
    var key = datastore.key(BOAT);
	const new_boat = {"name": req.body.name, "type": req.body.type, "length": req.body.length, "public": req.body.public, "owner": req.user.sub};
	await datastore.save({"key":key, "data":new_boat});
    
    // Retrieve the boat using the generated key and add id / self entities
    let boat_object = await datastore.get(key);
    if (boat_object[0] !== undefined || boat_object[0] !== null) {
        boat_object.map(fromDatastore);
        new_boat.id = boat_object[0].id;
        new_boat.self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + boat_object[0].id;
    }
    await datastore.save({"key":key, "data":new_boat});
    
    // Return the boat object in the POST request
    return key;
}

// Get boats for an owner
function get_owner_boats(owner){
	const q = datastore.createQuery(BOAT);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.owner === owner );
		});
}

// Get boats for an owner
function get_owner_public_boats(owner){
	const q = datastore.createQuery(BOAT);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => (item.owner === owner && item.public === true));
		});
}

// Get public boats
function get_public_boats(){
	const q = datastore.createQuery(BOAT);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.public === true );
		});
}

// Delete boat with provided ID
async function delete_boat(id){
    
    // Return "not found" if boat does not exist.
    const key = datastore.key([BOAT, parseInt(id,10)]);
    let boat = await datastore.get(key);
    if (boat[0] === undefined || boat[0] === null) return "not found";
    
    // Delete the boat if it exists
    return datastore.delete(key);
}


/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

login.post('/', function(req, res){
    const username = req.body.username;
    const password = req.body.password;
    var options = { method: 'POST',
            url: `https://${DOMAIN}/oauth/token`,
            headers: { 'content-type': 'application/json' },
            body:
             { grant_type: 'password',
               username: username,
               password: password,
               client_id: CLIENT_ID,
               client_secret: CLIENT_SECRET },
            json: true };
    request(options, (error, response, body) => {
        if (error){
            res.status(500).send(error);
        } else {
            res.send(body);
        }
    });

});

owners.get('/:owner_id/boats', checkJwt, function(err, req, res, next){
    if (err.status === 401) {
        get_owner_public_boats(req.params.owner_id)
            .then( (boats) => {
            res.status(200).json(boats);
            });
    }
    else {
        next()
    }
});
owners.get('/:owner_id/boats', function(req, res, next){
    get_owner_public_boats(req.params.owner_id)
        .then( (boats) => {
        res.status(200).json(boats);
        });
});

router.get('/', checkJwt, function(err, req, res, next){
    if (err.status === 401) {
        get_public_boats()
            .then( (boats) => {
            res.status(200).json(boats);
            });
    }
    else {
        next()
    }
});
router.get('/', function(req, res, next){
    get_owner_boats(req.user.sub)
        .then( (boats) => {
        res.status(200).json(boats);
        });
});


router.post("/", checkJwt, (err, req, res, next) => {
    if (err.status === 401) res.status(401).send("Invalid token...");
    else {
        next();
    }
});

router.post("/", (req, res, next) => {
    post_boat(req)
    .then( key => {
        res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
        res.status(201).send('{ "id": ' + key.id + ' }')
    } );
});

// Delete a boat
router.delete('/:boat_id', checkJwt, (err, req, res, next) => {
    if (err.status === 403) res.status(403).send("Forbidden");
    else if (err.status === 401) res.status(401).send("Invalid token..")
    else {
        next();
    }
});
router.delete('/:boat_id', function(req, res, next){
    delete_boat(req.params.boat_id).then( (result) => {
        if (result === "not found") res.status(404).send("Forbidden")
        else res.status(204).end();
    }
    );
});

/* ------------- End Controller Functions ------------- */

app.use('/boats', router);
app.use('/owners', owners);
app.use('/login', login);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});