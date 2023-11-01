const express = require('express');
const bodyParser = require('body-parser');

const router = express.Router();

const ds = require('./datastore');

const {Datastore} = require('@google-cloud/datastore');
const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";
const QLIMIT = 3;

router.use(bodyParser.json());


/* ------------- Begin Boat Model Functions ------------- */

// Create a boat
async function post_boat(req){
    
    // Save boat with initial data from POST request
    var key = datastore.key(BOAT);
    var loads = [];
	const new_boat = {"name": req.body.name, "type": req.body.type, 
                        "length": req.body.length, "loads": loads};
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

// Get a boat's loads and all info associated with it
async function get_boat_loads(id) {

    // Retrieve the boat
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    let boat = await datastore.get(key);

    // Check if the boat exists. Return "not found" if true.
    if (boat[0] === undefined || boat[0] === null) return "not found";

    // Create an array of loads for loads associated with the boat
    let loads = []
    for (let i = 0; i < boat[0].loads.length; i++){
        // Retrieve the load
        let l_id = boat[0].loads[i].id;
        let l_key = datastore.key([LOAD, parseInt(l_id, 10)]);
        let load = await datastore.get(l_key);
        // Create a json object containing load info
        let load_json = {}
        load_json.item = load[0].item;
        load_json.creation_date = load[0].creation_date;
        load_json.volume = load[0].volume;
        load_json.self = load[0].self;
        loads.push(load_json);
    }
    return {"loads": loads}

} 

// Get boats with next pagination implemented
function get_boats(req){
    
    // Create a query for QLIMIT number of boats
    var q = datastore.createQuery(BOAT).limit(QLIMIT);
    const results = {};
    // var prev;

    // If the URL includes a cursor, set start point of query to the cursor location
    if(Object.keys(req.query).includes("cursor")){ 
        let decode_cursor = decodeURIComponent(req.query.cursor);
        // prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + decode_cursor;
        q = q.start(decode_cursor);
    }

    // Return the results set with items from the query and a next cursor
	return datastore.runQuery(q).then( (entities) => {
            results.boats = entities[0].map(ds.fromDatastore);
            // if(typeof prev !== 'undefined') results.previous = prev;
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                let encode_cursor = encodeURIComponent(entities[1].endCursor);
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + encode_cursor;
            }
			return results;  
		});
}


// Assign a load to a boat
async function put_assign_load(bid, lid){  

    // Get the boat and load objects from datastore
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    let boat = await datastore.get(b_key);
    const l_key = datastore.key([LOAD, parseInt(lid,10)]);
    let load = await datastore.get(l_key);

    // Check if the boat / load do not exist. Return "not found" if true.
    if (boat[0] === undefined || boat[0] === null ||
        load[0] === undefined || load[0] === null) return "not found";

    // Check if the load already has a carrier assigned. Return "carrier assigned" if true.
    if (load[0].carrier !== null) return "carrier assigned";

    // Assign the load to the boat by adding to loads array
    let load_json = {}
    load_json.id = load[0].id;
    load_json.self = load[0].self;
    boat[0].loads.push(load_json);

    // Assign the boat to the load as carrier
    let boat_json = {}
    boat_json.id = boat[0].id;
    boat_json.self = boat[0].self;
    boat_json.name = boat[0].name;
    load[0].carrier = boat_json;

    // Save alterations back to the datastore
    let s = await datastore.save({"key":l_key, "data":load[0]})
    return datastore.save({"key":b_key, "data":boat[0]});
}

// Delete load from boat
async function delete_remove_load_from_boat(bid, lid){  

    // Get the boat and load objects from datastore
    const b_key = datastore.key([BOAT, parseInt(bid,10)]);
    let boat = await datastore.get(b_key);
    const l_key = datastore.key([LOAD, parseInt(lid,10)]);
    let load = await datastore.get(l_key);

    // Check if the boat / load do not exist. Return "not found" if true.
    if (boat[0] === undefined || boat[0] === null ||
        load[0] === undefined || load[0] === null) return "not found";

    // Remove the load from the boat's loads array
    let in_loads = false;
    for (let i = 0; i < boat[0].loads.length; i++) {
        if (boat[0].loads[i].id === lid) {
            delete(boat[0].loads[i]);
            in_loads = true;
        }
    }
    // Remove the empty item from delete operation
    var filtered_loads = boat[0].loads.filter(x => {
        return x != null;
    });
    boat[0].loads = filtered_loads;

    // Check if the load was not assigned to the boat. Return "not assigned" if true.
    if (in_loads === false) return "not assigned";

    // Assign the load's carrier to null
    load[0].carrier = null;

    // Save alterations back to the datastore
    let s = await datastore.save({"key":l_key, "data":load[0]})
    return datastore.save({"key":b_key, "data":boat[0]});
}

async function delete_boat(id){
    
    // Check if the boat exists. Return "not found" if true.
    const b_key = datastore.key([BOAT, parseInt(id,10)]);
    let boat = await datastore.get(b_key);
    if (boat[0] === undefined || boat[0] === null) return "not found";

    // Get all the ids for loads associated with a boat
    let load_ids = []
    for (let i = 0; i < boat[0].loads.length; i++) {
        load_ids.push(boat[0].loads[i].id)
    }

    // Find loads where boat to be deleted is the carrier of the load
    let l_key;
    let load;
    for (let i = 0; i < load_ids.length; i++) {

        // Retrieve load from datastore
        l_key = datastore.key([LOAD, parseInt(load_ids[i],10)]);
        load = await datastore.get(l_key);

        // Assign the load's carrier to null and save to datastore.
        load[0].carrier = null;
        let s = await datastore.save({"key":l_key, "data":load[0]})
    }
    
    // Delete the boat if it exists
    return datastore.delete(b_key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// Create a boat
router.post('/', function (req, res) {
    if (req.body.name === null || req.body.name === undefined ||
        req.body.type === null || req.body.type === undefined ||
        req.body.length === null || req.body.length === undefined) {
            res.status(400).json({"Error": "The request object is missing at least one of the required attributes"})
            return
        }
    post_boat(req)
        .then(boat => { res.status(201).json(boat[0])});
});

// Get a boat using its ID
router.get('/:id', function (req, res) {
    get_boat(req.params.id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else {
                // Return the 0th element which is the boat with this id
                res.status(200).json(boat[0]);
            }
        });
});

// Get all loads for a boat
router.get('/:id/loads', function (req, res) {
    get_boat_loads(req.params.id)
        .then(result => {
            if (result === "not found") res.status(404).send({"Error": 'No boat with this boat_id exists'});
            else res.status(200).json(result);
        });
});

// Get all boats with pagination
router.get('/', function (req, res) {
    get_boats(req)
        .then((boats) => {
            res.status(200).json(boats);
        });
});

// Assign a load to a boat
router.put('/:bid/loads/:lid', function(req, res){
    put_assign_load(req.params.bid, req.params.lid)
    .then( (result) => {
        if (result === "carrier assigned") res.status(403).send({"Error": "The load is already loaded on another boat"})
        else if (result === "not found") res.status(404).send({"Error": "The specified boat and/or load does not exist"})
        else res.status(204).end()
    }
        );
});

// Remove a load from a boat
router.delete('/:bid/loads/:lid', function(req, res){
    delete_remove_load_from_boat(req.params.bid, req.params.lid)
    .then( (result) => {
        if (result === "not assigned") res.status(404).send({"Error": "No boat with this boat_id is loaded with the load with this load_id"})
        else if (result === "not found") res.status(404).send({"Error": "No boat with this boat_id is loaded with the load with this load_id"})
        else res.status(204).end()
    }
        );
});

// Delete a boat
router.delete('/:id', function(req, res){
    delete_boat(req.params.id).then( (result) => {
        if (result === "not found") res.status(404).send({"Error": "No boat with this boat_id exists"})
        else res.status(204).end();
    }
        );
});

/* ------------- End Controller Functions ------------- */

module.exports = router;