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


/* ------------- Begin Load Model Functions ------------- */

// Create a load
async function post_load(req){

    // Save load with initial data from POST request
    var key = datastore.key(LOAD);
    var carrier = null;
	const new_load = {"volume": req.body.volume, "item": req.body.item, 
                        "creation_date": req.body.creation_date, "carrier": carrier};
	let s = await datastore.save({"key":key, "data":new_load});

    // Retrieve the load using the generated key and add id / self entities
    let load_object = await datastore.get(key);
    if (load_object[0] !== undefined || load_object[0] !== null) {
        load_object.map(ds.fromDatastore);
        new_load.id = load_object[0].id;
        new_load.self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + load_object[0].id;
    }
    s = await datastore.save({"key":key, "data":new_load});
    load_object = await datastore.get(key);

    // Return the load object in the POST request
    return load_object;
}

// Get load using ID
function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key);
} 

// Get loads with next pagination implemented
function get_loads(req){

    // Create a query to retrieve QLIMIT number of loads
    var q = datastore.createQuery(LOAD).limit(QLIMIT);
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
            results.loads = entities[0].map(ds.fromDatastore);
            // if(typeof prev !== 'undefined') results.previous = prev;
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                let encode_cursor = encodeURIComponent(entities[1].endCursor);
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + encode_cursor;
            }
			return results;  
		});
}

// Delete load from datastore
async function delete_load(id){

    // Check if the load exists. Return "not found" if true.
    const l_key = datastore.key([LOAD, parseInt(id,10)]);
    let load = await datastore.get(l_key);
    if (load[0] === undefined || load[0] === null) return "not found";

    // Get the boat associated with the load
    let b_id = load[0].carrier.id
    let b_key;
    let boat;
    if (b_id !== null || b_id !== undefined) {
        // Retrieve boat from datastore
        b_key = datastore.key([BOAT, parseInt(b_id,10)]);
        boat = await datastore.get(b_key);
        // Remove the load from the boat
        for (let i = 0; i < boat[0].loads.length; i++) {
            if (boat[0].loads[i].id === id) delete(boat[0].loads[i]);
        }
        // Remove the empty item from delete operation
        var filtered_loads = boat[0].loads.filter(x => {
            return x != null;
        });
        boat[0].loads = filtered_loads;
        // Save the boat with load removed
        let s = await datastore.save({"key":b_key, "data":boat[0]});
    }

    // Delete the load if the load exists
    return datastore.delete(l_key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// Create a load
router.post('/', function (req, res) {
    if (req.body.volume === null || req.body.volume === undefined ||
        req.body.item === null || req.body.item === undefined ||
        req.body.creation_date === null || req.body.creation_date === undefined) {
            res.status(400).json({"Error": "The request object is missing at least one of the required attributes"})
            return
        }
    post_load(req)
        .then(load => { res.status(201).json(load[0])});
});

// Get a load
router.get('/:id', function (req, res) {
    get_load(req.params.id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no load with this id
                res.status(404).json({ 'Error': "No load with this load_id exists" });
            } else {
                // Return the 0th element which is the load with this id
                res.status(200).json(load[0]);
            }
        });
});

// Get a set of loads via pagination
router.get('/', function (req, res) {
    get_loads(req)
        .then((loads) => {
            res.status(200).json(loads);
        });
});

// Delete a load
router.delete('/:id', function(req, res){
    delete_load(req.params.id).then( (result) => {
        if (result === "not found") res.status(404).send({"Error": "No load with this load_id exists"})
        else res.status(204).end();
    }
        );
});

/* ------------- End Controller Functions ------------- */

module.exports = router;