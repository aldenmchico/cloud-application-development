const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');

const router = express.Router();

const ds = require('./datastore');

const { Datastore, PropertyFilter } = require('@google-cloud/datastore');

const datastore = ds.datastore;

const BOAT = "Boat";
const QLIMIT = 3;

router.use(bodyParser.json());


/* ------------- Begin Boat Model Functions ------------- */

// Create a boat
async function post_boat(req){
    
    // Return "invalid attribute" if an extraneous attribute was found in input
    const keys = Object.keys(req.body);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'name' || keys[i] === 'type' || keys[i] === 'length') continue;
        return "invalid attribute";
    }

    // Return "insufficient attributes" if not all the fields are included in request body
    var regex = /^[a-zA-Z0-9 ]+$/;
    if (req.body.name === null || req.body.name === undefined ||
        req.body.type === null || req.body.type === undefined ||
        req.body.length === null || req.body.length === undefined) return "insufficient attributes";
    // Return "invalid name" if the name attribute is above 40 characters or contains non alphanumeric characters
    if (req.body.name.length > 40 || !regex.test(req.body.name)) return "invalid name";
    // Return "invalid type" if the type attribute is above 40 characters or contains non alphanumeric characters
    if (req.body.type.length > 40 || !regex.test(req.body.type)) return "invalid type";
    // Return "invalid length" if length entered is not a number
    if (isNaN(Number(req.body.length))) return "invalid length";

    // Return "same name" if a boat exists with the same name provided in request body
    const q = datastore.createQuery(BOAT).filter(new PropertyFilter('name', '=', req.body.name))
    let q_results = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
    if (q_results.length !== 0) return "same name";

    // Save boat with initial data from POST request
    var key = datastore.key(BOAT);
	const new_boat = {"name": req.body.name, "type": req.body.type, "length": req.body.length};
	let s = await datastore.save({"key":key, "data":new_boat});
    
    // Retrieve the boat using the generated key and add id / self entities
    let boat_object = await datastore.get(key);
    if (boat_object[0] !== undefined || boat_object[0] !== null) {
        boat_object.map(ds.fromDatastore);
        new_boat.id = boat_object[0].id;
        new_boat.self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + boat_object[0].id;
    }
    s = await datastore.save({"key":key, "data":new_boat});
    boat_object = await datastore.get(key);
    
    // Return the boat object in the POST request
    return boat_object;
}

// Get boat using ID
function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key);
}

// Get boats with next pagination implemented
function get_boats(req){
    
    // Create a query for QLIMIT number of boats
    var q = datastore.createQuery(BOAT).limit(QLIMIT);
    const results = {};

    // If the URL includes a cursor, set start point of query to the cursor location
    if(Object.keys(req.query).includes("cursor")){ 
        let decode_cursor = decodeURIComponent(req.query.cursor);
        q = q.start(decode_cursor);
    }

    // Return the results set with items from the query and a next cursor
	return datastore.runQuery(q).then( (entities) => {
            results.boats = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                let encode_cursor = encodeURIComponent(entities[1].endCursor);
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + encode_cursor;
            }
			return results;  
		});
}

// Edit all the fields for an existing boat
async function put_boat(req) {

    // Return "not found" if boat does not exist.
    const key = datastore.key([BOAT, parseInt(req.params.id, 10)]);
    let boat = await datastore.get(key);
    if (boat[0] === undefined || boat[0] === null) return "not found";

    // Return "invalid attribute" if an extraneous attribute was found in input
    const keys = Object.keys(req.body);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'name' || keys[i] === 'type' || keys[i] === 'length') continue;
        return "invalid attribute";
    }

    // Return "insufficient attributes" if not all the fields are included in request body
    var regex = /^[a-zA-Z0-9 ]+$/;
    if (req.body.name === null || req.body.name === undefined ||
        req.body.type === null || req.body.type === undefined ||
        req.body.length === null || req.body.length === undefined) return "insufficient attributes";
    // Return "invalid name" if the name attribute is above 40 characters or contains non alphanumeric characters
    if (req.body.name.length > 40 || !regex.test(req.body.name)) return "invalid name";
    // Return "invalid type" if the type attribute is above 40 characters or contains non alphanumeric characters
    if (req.body.type.length > 40 || !regex.test(req.body.type)) return "invalid type";
    // Return "invalid length" if length entered is not a number
    if (isNaN(Number(req.body.length))) return "invalid length";
    

    // Return "same name" if a boat exists with the same name provided in request body
    const q = datastore.createQuery(BOAT).filter(new PropertyFilter('name', '=', req.body.name))
    let q_results = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
    if (q_results.length !== 0) return "same name";

    // Update the boat if it exists
    const updated_boat = { "name": req.body.name, "type": req.body.type, "length": req.body.length,
                            "id": boat[0].id, "self": boat[0].self };
    const s = await datastore.save({ "key": key, "data": updated_boat });

    // Return the updated boat object
    return datastore.get(key);
}


// Edit one or many of the fields for an existing boat
async function patch_boat(req) {

    // Return "not found" if boat does not exist.
    const key = datastore.key([BOAT, parseInt(req.params.id,10)]);
    let boat = await datastore.get(key);
    if (boat[0] === undefined || boat[0] === null) return "not found";

    /// Return "invalid attribute" if an extraneous attribute was found in input
    const keys = Object.keys(req.body);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'name' || keys[i] === 'type' || keys[i] === 'length') continue;
        return "invalid attribute";
    }

    // Update the boat with parameters defined in request body
    let updated_boat = {}
    updated_boat.id = boat[0].id;
    updated_boat.self = boat[0].self;

    // Update name attribute if it's included in the request body. 
    var regex = /^[a-zA-Z0-9 ]+$/;
    if (req.body.name === null || req.body.name === undefined) updated_boat.name = boat[0].name;
    else {
         // Return "same name" if a boat exists with the same name provided in request body
        const q = datastore.createQuery(BOAT).filter(new PropertyFilter('name', '=', req.body.name))
        let q_results = await datastore.runQuery(q).then((entities) => {
            return entities[0].map(ds.fromDatastore);
        });
        if (q_results.length !== 0) return "same name";
        // Return invalid name if name contains non-alphanumeric character or is above 40 characters.
        if (req.body.name.length > 40 || !regex.test(req.body.name)) return "invalid name";
        else updated_boat.name = req.body.name;
    }

    // Update type attribute if it's included in the request body. Return invalid type if type contains non-alphanumeric character or is above 40 characters.
    if (req.body.type === null || req.body.type === undefined) updated_boat.type = boat[0].type;
    else {
        if (req.body.type.length > 40 || !regex.test(req.body.type)) return "invalid type";
        else updated_boat.type = req.body.type;
    }

    // Update length attribute if it's included in the request body. Return invalid length if the length value is not a number.
    if (req.body.length === null || req.body.length === undefined) updated_boat.length = boat[0].length;
    else {
        if (isNaN(Number(req.body.length))) return "invalid length";
        else updated_boat.length = req.body.length;
    }
   
    // Update the boat if it exists
    const s = await datastore.save({ "key": key, "data": updated_boat });
    
    // Return the updated boat object
    return datastore.get(key);
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

// Create a boat
router.post('/', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
            post_boat(req)
            .then(boat => {
                res.set("Content", "application/json");
                if (boat === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
                else if (boat === "insufficient attributes") res.status(400).json({"Error": "The request object is missing at least one of the required attributes"});
                else if (boat === "invalid name") res.status(400).json({"Error": "The request object's name attribute is not a valid boat name"});
                else if (boat === "invalid type") res.status(400).json({"Error": "The request object's type attribute is not a valid boat type"});
                else if (boat === "invalid length") res.status(400).json({"Error": "The request object's length attribute is not a valid number"});
                else if (boat === "same name") res.status(403).json({"Error": "The name provided in request already exists"});
                else {
                    res.location(req.protocol + "://" + req.get('host') + req.baseUrl + "/" + boat[0].id); 
                    res.status(201).json(boat[0]);
                }
            });
    }
});

// Get all boats with pagination
router.get('/', function (req, res) {
    get_boats(req)
        .then((boats) => {
            res.status(200).json(boats);
        });
});

// Get a boat using its ID
router.get('/:id', function (req, res) {
    get_boat(req.params.id)
        .then(boat => {
            const accepts = req.accepts(['application/json', 'text/html']);
            if (!accepts) res.status(406).json({"Error": "Not Acceptable"});
            else {
                if (boat[0] === undefined || boat[0] === null) {
                    // The 0th element is undefined. This means there is no boat with this id
                    res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    // Return the 0th element which is the boat with this id
                    if (accepts === 'application/json') res.status(200).json(boat[0]);
                    else if (accepts === 'text/html') res.status(200).send(json2html(boat[0]).slice(1,-1));
                    else res.status(500).send('Content type got messed up!');
                }
            }
        });
});

// Edit all the fields for an existing boat
router.put('/:id', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
        put_boat(req).then( (boat) => {
            res.set("Content", "application/json");
            if (boat === "not found") res.status(404).json({"Error": "No boat with this boat_id exists"});
            else if (boat === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
            else if (boat === "insufficient attributes") res.status(400).json({"Error": "The request object is missing at least one of the required attributes"});
            else if (boat === "invalid name") res.status(400).json({"Error": "The request object's name attribute is not a valid boat name"});
            else if (boat === "invalid type") res.status(400).json({"Error": "The request object's type attribute is not a valid boat type"});
            else if (boat === "invalid length") res.status(400).json({"Error": "The request object's length attribute is not a valid number"});
            else if (boat === "same name") res.status(403).json({"Error": "The name provided in request already exists"});
            else {
                res.location(req.protocol + "://" + req.get('host') + req.baseUrl + "/" + boat[0].id); 
                res.status(303).json(boat[0]);
            }
        });
    }
});

// Edit one or many of the fields for an existing boat
router.patch('/:id', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
        patch_boat(req).then( (boat) => {
            res.set("Content", "application/json");
            if (boat === "not found") res.status(404).json({"Error": "No boat with this boat_id exists"});
            else if (boat === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
            else if (boat === "invalid name") res.status(400).json({"Error": "The request object's name attribute is not a valid boat name"});
            else if (boat === "invalid type") res.status(400).json({"Error": "The request object's type attribute is not a valid boat type"});
            else if (boat === "invalid length") res.status(400).json({"Error": "The request object's length attribute is not a valid number"});
            else if (boat === "same name") res.status(403).json({"Error": "The name provided in request already exists"});
            else res.status(200).json(boat[0]);
        });
    }
});

// Delete a boat
router.delete('/:id', function(req, res){
    delete_boat(req.params.id).then( (result) => {
        if (result === "not found") res.status(404).send({"Error": "No boat with this boat_id exists"})
        else res.status(204).end();
    }
    );
});
// Return 405 status code for DELETE on root URL
router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "Not Acceptable"});
});

// Return 405 status code for PUT on root URL
router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "Not Acceptable"});
});
/* ------------- End Controller Functions ------------- */

module.exports = router;