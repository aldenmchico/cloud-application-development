const express = require('express');
const app = express();

const { Datastore, PropertyFilter } = require('@google-cloud/datastore');
const bodyParser = require('body-parser');

const datastore = new Datastore();

const BOAT = "Boat";
const SLIP = "Slip"

const boat_router = express.Router();
const slip_router = express.Router();

app.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

/* ------------- Begin Boat/Slip Model Functions ------------- */
function post_boat(name, type, length) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length };
    return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

function get_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        // Use Array.map to call the function fromDatastore. This function
        // adds id attribute to every element in the array at element 0 of
        // the variable entities
        return entities[0].map(fromDatastore);
    });
}

function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(fromDatastore);
        }
    });
} 

function patch_boat(id, name, type, length) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    const boat = { "name": name, "type": type, "length": length };
    return datastore.save({ "key": key, "data": boat });
}

async function delete_boat(id) {
    
    const q = datastore.createQuery(SLIP).filter(new PropertyFilter('current_boat', '=', id))
    let q_results = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore);
    });
    if (q_results[0] !== undefined || q_results[0] !== null){
        try { // remove boat if associated with a slip
            let slip_id = Number(q_results[0].id);
            let slip_key = datastore.key([SLIP, parseInt(slip_id, 10)]);
            let slip_data = { "number": q_results[0].number, "current_boat": null };
            let s = await datastore.save({ "key": slip_key, "data": slip_data });
        } catch {
        }
    }
    let boat_key = datastore.key([BOAT, parseInt(id, 10)]);
    let d = await datastore.delete(boat_key);
    if (d[0].indexUpdates === 0) return 404;
    return 204;
}

function post_slip(number) {
    var key = datastore.key(SLIP);
    const new_slip = { "number": number, "current_boat": null };
    return datastore.save({ "key": key, "data": new_slip }).then(() => { return key });
}


function get_slips() {
    const q = datastore.createQuery(SLIP);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore);
    });
}

function get_slip(id) {
    const key = datastore.key([SLIP, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(fromDatastore);
        }
    });
}

async function delete_slip(id) {
    const key = datastore.key([SLIP, parseInt(id, 10)]);
    d = await datastore.delete(key);
    if (d[0].indexUpdates === 0) return 404;
    return 200;
}

async function boat_arrives_at_slip(slip_id, boat_id) {
    let key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    let entity = await datastore.get(key);
    if (entity[0] === undefined || entity[0] === null)  return 404; // boat doesn't exist, error 404
    let boat = entity.map(fromDatastore);
    
    key = datastore.key([SLIP, parseInt(slip_id, 10)]);
    entity = await datastore.get(key);
    if (entity[0] === undefined || entity[0] === null)  return 404; // slip doesn't exist, error 404
    let slip = entity.map(fromDatastore);

    if (slip[0].current_boat !== null) return 403;  // slip has a boat, error 403
    const slip_data = { "number": slip[0].number, "current_boat": boat[0].id};
    let save = await datastore.save({ "key": key, "data": slip_data });
    return 204;
}

async function boat_departs_slip(slip_id, boat_id) {
    let key = datastore.key([BOAT, parseInt(boat_id, 10)]);
    let entity = await datastore.get(key);
    if (entity[0] === undefined || entity[0] === null)  return 404; // boat doesn't exist, error 404
    let boat = entity.map(fromDatastore);
    
    key = datastore.key([SLIP, parseInt(slip_id, 10)]);
    entity = await datastore.get(key);
    if (entity[0] === undefined || entity[0] === null)  return 404; // slip doesn't exist, error 404
    let slip = entity.map(fromDatastore);

    if (slip[0].current_boat !== boat[0].id) return 404; // boat isn't the correct one in slip, error 404
    const slip_data = { "number": slip[0].number, "current_boat": null};
    let save = await datastore.save({ "key": key, "data": slip_data });
    return 204;
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

boat_router.post('/', function (req, res) {
    if (req.body.name === null || req.body.name === undefined ||
        req.body.type === null || req.body.type === undefined ||
        req.body.length === null || req.body.length === undefined) {
            res.status(400).json({"Error": "The request object is missing at least one of the required attributes"})
            return
        }
    post_boat(req.body.name, req.body.type, req.body.length)
        .then(key => { res.status(201).send({"id": key.id, "name": req.body.name, "type": req.body.type, "length": req.body.length}) });
});

boat_router.get('/', function (req, res) {
    get_boats()
        .then((boats) => {
            res.status(200).json(boats);
        });
});

boat_router.get('/:id', function (req, res) {
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

boat_router.patch('/:id', function (req, res) {
    if (req.body.name === null || req.body.name === undefined ||
        req.body.type === null || req.body.type === undefined ||
        req.body.length === null || req.body.length === undefined) {
            res.status(400).json({"Error": "The request object is missing at least one of the required attributes"})
            return
        }
    get_boat(req.params.id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                // The 0th element is undefined. This means there is no boat with this id
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                return 404
            }
            })
        .then((check) => {
            if (check === 404) return 404
            patch_boat(req.params.id, req.body.name, req.body.type, req.body.length)
            .then(boat => {
                if (boat[0].indexUpdates === 0) {
                    res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
                } else {
                    // Return the 0th element which is the slip with this id
                    res.status(200).send({"id": req.params.id, "name": req.body.name, "type": req.body.type, "length": req.body.length})
                }
        });
        })
    
});

boat_router.delete('/:id', function (req, res) {
    delete_boat(req.params.id)
        .then(status => {
            if (status === 404) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else {
                res.status(204).end();
            }
        });
});


slip_router.post('/', function (req, res) {
    if (req.body.number === null || req.body.number === undefined) {
            res.status(400).json({"Error": "The request object is missing the required number"})
            return
        }
    post_slip(req.body.number)
        .then(key => { res.status(201).send({"id": key.id, "number": req.body.number, "current_boat": null}) });
});

slip_router.get('/', function (req, res) {
    get_slips()
        .then((slips) => {
            res.status(200).json(slips);
        });
});

slip_router.get('/:id', function (req, res) {
    get_slip(req.params.id)
        .then(slip => {
            if (slip[0] === undefined || slip[0] === null) {
                // The 0th element is undefined. This means there is no slip with this id
                res.status(404).json({ 'Error': 'No slip with this slip_id exists' });
            } else {
                // Return the 0th element which is the slip with this id
                res.status(200).json(slip[0]);
            }
        });
});

slip_router.delete('/:id', function (req, res) {
    delete_slip(req.params.id)
        .then(status => {
            if (status === 404) {
                res.status(404).json({ 'Error': 'No slip with this slip_id exists' });
            } else {
                res.status(204).end();
            }
        });
});

slip_router.put('/:slip_id/:boat_id', function(req, res) {
    boat_arrives_at_slip(req.params.slip_id, req.params.boat_id)
    .then(status => {
        if (status === 204) res.status(204).end();
        if (status === 403) res.status(403).json({"Error": "The slip is not empty"})
        if (status === 404) res.status(404).json({"Error": "The specified boat and/or slip does not exist"})
    })
});

slip_router.delete('/:slip_id/:boat_id', function(req, res) {
    boat_departs_slip(req.params.slip_id, req.params.boat_id)
    .then(status => {
        if (status === 204) res.status(204).end();
        if (status === 404) res.status(404).json({"Error": "No boat with this boat_id is at the slip with this slip_id"})
    })
});

/* ------------- End Controller Functions ------------- */

app.use('/boats', boat_router);
app.use('/slips', slip_router);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});