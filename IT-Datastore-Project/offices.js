const express = require('express');
const bodyParser = require('body-parser');
const json2html = require('json-to-html');

const router = express.Router();

const ds = require('./datastore');

const { Datastore, PropertyFilter } = require('@google-cloud/datastore');

const datastore = ds.datastore;

const OFFICE = "Office";
const EMPLOYEE = "Employee";
const QLIMIT = 3;

// Global RegEx variables
var companyPattern = /^[a-zA-Z\s\-\d.!']{2,40}$/;
var cityPattern = /^[a-zA-Z\s\-']{2,40}$/;
var generalManagerPattern = /^[a-zA-Z\s]{2,40}$/;
var phonePattern = /^[\d()+\-\s]{10,}$/;

// Global US State Abbreviations Array
const usStateAbbreviations = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 
    'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 
    'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

router.use(bodyParser.json());


/* ------------- Begin Office Model Functions ------------- */

// Create an office
async function post_office(req){
    
    // Return "invalid attribute" if an extraneous attribute was found in input
    const keys = Object.keys(req.body);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'company' || keys[i] === 'city' ||  keys[i] == 'state' || keys[i] === 'general_manager' || keys[i] === 'phone_number') continue;
        return "invalid attribute";
    }

    // Return "insufficient attributes" if not all the fields are included in request body
    if (req.body.company === null || req.body.company === undefined ||
        req.body.city === null || req.body.city === undefined ||
        req.body.state === null || req.body.state === undefined ||
        req.body.general_manager === null || req.body.general_manager === undefined ||
        req.body.phone_number === null || req.body.phone_number === undefined) return "insufficient attributes";
    // Return "invalid company" if the company attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!companyPattern.test(req.body.company)) return "invalid company";
    // Return "invalid city" if the city attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!cityPattern.test(req.body.city)) return "invalid city";
    // Return "invalid state" if the state attribute is not in the US State Abbreviations array
    if (!usStateAbbreviations.includes(req.body.state)) return "invalid state";
    // Return "invalid general manager" if the general manager attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!generalManagerPattern.test(req.body.general_manager)) return "invalid general manager";
    // Return "invalid phone" if the phone attribute contains characters not typically found in a phone number
    if (!phonePattern.test(req.body.phone_number)) return "invalid phone";

    // Return "company exists" if a company exists with the same company name provided in request body
    const q = datastore.createQuery(OFFICE).filter(new PropertyFilter('company', '=', req.body.company))
    let q_results = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
    if (q_results.length !== 0) return "company exists";

    // Save office with initial data from POST request
    var key = datastore.key(OFFICE);
	const new_office = {"company": req.body.company, "city": req.body.city, "state": req.body.state, "general_manager": req.body.general_manager,
                        "phone_number": req.body.phone_number, "employees": []};
	let s = await datastore.save({"key":key, "data":new_office});
    
    // Retrieve the office using the generated key and add id / self entities
    let office_object = await datastore.get(key);
    if (office_object[0] !== undefined || office_object[0] !== null) {
        office_object.map(ds.fromDatastore);
        new_office.id = office_object[0].id;
        new_office.self = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + office_object[0].id;
    }
    s = await datastore.save({"key":key, "data":new_office});
    office_object = await datastore.get(key);
    
    // Return the office object in the POST request
    return office_object;
}

// Assign an employee to an office
async function put_assign_employee(oid, eid){  
    try {
    // Get the office and employee objects from datastore
    const o_key = datastore.key([OFFICE, parseInt(oid,10)]);
    let office = await datastore.get(o_key);
    const e_key = datastore.key([EMPLOYEE, parseInt(eid,10)]);
    let employee = await datastore.get(e_key);

    // Check if the office / employee do not exist. Return "not found" if true.
    if (office[0] === undefined || office[0] === null ||
        employee[0] === undefined || employee[0] === null) return "not found";

    // Check if the employee already has a employer assigned. Return "employer assigned" if true.
    if (employee[0].employer !== null) return "employer assigned";

    // Assign the employee to the office by adding to employees array
    let employee_json = {}
    employee_json.id = employee[0].id;
    employee_json.self = employee[0].self;
    employee_json.first_name = employee[0].first_name;
    employee_json.last_name = employee[0].last_name;
    office[0].employees.push(employee_json);

    // Assign the office to the employee as employer
    let office_json = {}
    office_json.id = office[0].id;
    office_json.self = office[0].self;
    office_json.company = office[0].company;
    employee[0].employer = office_json;

    // Save alterations back to the datastore
    let s = await datastore.save({"key":e_key, "data":employee[0]})
    return datastore.save({"key":o_key, "data":office[0]});

    } catch {
        return "not found";
    }
}

// Remove employee from company
async function delete_remove_employee_from_office(oid, eid){  

    // Get the office and employee objects from datastore
    const o_key = datastore.key([OFFICE, parseInt(oid,10)]);
    let office = await datastore.get(o_key);
    const e_key = datastore.key([EMPLOYEE, parseInt(eid,10)]);
    let employee = await datastore.get(e_key);

    // Check if the office / employee do not exist. Return "not found" if true.
    if (office[0] === undefined || office[0] === null ||
        employee[0] === undefined || employee[0] === null) return "not found";

    // Remove the employee from the office's employees array
    let in_employees = false;
    for (let i = 0; i < office[0].employees.length; i++) {
        if (office[0].employees[i].id === eid) {
            delete(office[0].employees[i]);
            in_employees = true;
        }
    }
    // Remove the empty item from delete operation
    var filtered_employees = office[0].employees.filter(x => {
        return x != null;
    });
    office[0].employees = filtered_employees;

    // Check if the employee was not assigned to the office. Return "not assigned" if true.
    if (in_employees === false) return "not assigned";

    // Assign the employee's employer to null
    employee[0].employer = null;

    // Save alterations back to the datastore
    let s = await datastore.save({"key":e_key, "data":employee[0]})
    return datastore.save({"key":o_key, "data":office[0]});
}

// Get office using ID
async function get_office(id) {
    try {
        const key = datastore.key([OFFICE, parseInt(id, 10)]);
        let r = await datastore.get(key);
        return r;
    } catch {
        return "not found";
    }
}

// Get offices with next pagination implemented
function get_offices(req){
    
    // Create a query for QLIMIT number of offices
    var q = datastore.createQuery(OFFICE).limit(QLIMIT);
    const results = {};

    // If the URL includes a cursor, set start point of query to the cursor location
    if(Object.keys(req.query).includes("cursor")){ 
        let decode_cursor = decodeURIComponent(req.query.cursor);
        q = q.start(decode_cursor);
    }

    // Return the results set with items from the query and a next cursor
	return datastore.runQuery(q).then( (entities) => {
            results.offices = entities[0].map(ds.fromDatastore);
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                let encode_cursor = encodeURIComponent(entities[1].endCursor);
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + encode_cursor;
            }
			return results;  
		});
}

// Edit all the fields for an existing office
async function put_office(req) {

    // Return "not found" if office does not exist.
    const key = datastore.key([OFFICE, parseInt(req.params.id, 10)]);
    let office = await datastore.get(key);
    if (office[0] === undefined || office[0] === null) return "not found";

    // Return "invalid attribute" if an extraneous attribute was found in input
    const keys = Object.keys(req.body);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'company' || keys[i] === 'city' ||  keys[i] == 'state' || keys[i] === 'general_manager' || keys[i] === 'phone_number') continue;
        return "invalid attribute";
    }

    // Return "insufficient attributes" if not all the fields are included in request body
    if (req.body.company === null || req.body.company === undefined ||
        req.body.city === null || req.body.city === undefined ||
        req.body.state === null || req.body.state === undefined ||
        req.body.general_manager === null || req.body.general_manager === undefined ||
        req.body.phone_number === null || req.body.phone_number === undefined) return "insufficient attributes";
    // Return "invalid company" if the company attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!companyPattern.test(req.body.company)) return "invalid company";
    // Return "invalid city" if the city attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!cityPattern.test(req.body.city)) return "invalid city";
    // Return "invalid state" if the state attribute is not in the US State Abbreviations array
    if (!usStateAbbreviations.includes(req.body.state)) return "invalid state";
    // Return "invalid general manager" if the general manager attribute contains non alphanumeric characters and is not between 2-40 characters in length
    if (!generalManagerPattern.test(req.body.general_manager)) return "invalid general manager";
    // Return "invalid phone" if the phone attribute contains characters not typically found in a phone number
    if (!phonePattern.test(req.body.phone_number)) return "invalid phone";
    
    // Return "company exists" if a office exists with the same company name provided in request body
    const q = datastore.createQuery(OFFICE).filter(new PropertyFilter('company', '=', req.body.company))
    let q_results = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
    if (q_results.length !== 0) return "company exists";

    // Update the office if it exists
    const updated_office = { "company": req.body.company, "city": req.body.city, "state": req.body.state, "general_manager": req.body.general_manager, 
                            "phone_number": req.body.phone_number, "id": office[0].id, "self": office[0].self };
    const s = await datastore.save({ "key": key, "data": updated_office });

    // Return the updated office object
    return datastore.get(key);
}


// Edit one or many of the fields for an existing office
async function patch_office(req) {
    try {
        // Return "not found" if office does not exist.
        const key = datastore.key([OFFICE, parseInt(req.params.id, 10)]);
        let office = await datastore.get(key);
        if (office[0] === undefined || office[0] === null) return "not found";

        // Return "invalid attribute" if an extraneous attribute was found in input
        const keys = Object.keys(req.body);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i] === 'company' || keys[i] === 'city' ||  keys[i] == 'state' || keys[i] === 'general_manager' || keys[i] === 'phone_number') continue;
            return "invalid attribute";
        }

        // Update the office with parameters defined in request body
        let updated_office = {}
        updated_office.id = office[0].id;
        updated_office.self = office[0].self;

        // Update company attribute if it's included in the request body.
        if (req.body.company === null || req.body.company === undefined) updated_office.company = office[0].company;
        else {
            // Return "company exists" if a company exists with the same company name provided in request body
            const q = datastore.createQuery(OFFICE).filter(new PropertyFilter('company', '=', req.body.company))
            let q_results = await datastore.runQuery(q).then((entities) => {
                return entities[0].map(ds.fromDatastore);
            });
            if (q_results.length !== 0) return "company exists";
            // Return "invalid company" if the company attribute contains non alphanumeric characters and is not between 2-40 characters in length
            if (!companyPattern.test(req.body.company)) return "invalid company";
            else updated_office.company = req.body.company;
        }

        // Update city attribute if it's included in the request body.
        if (req.body.city === null || req.body.city === undefined) updated_office.city = office[0].city;
        else {
            // Return "invalid city" if the city attribute contains non alphanumeric characters and is not between 2-40 characters in length
            if (!cityPattern.test(req.body.city)) return "invalid city";
            else updated_office.city = req.body.city;
        }

        // Update state attribute if it's included in the request body.
        if (req.body.state === null || req.body.state === undefined) updated_office.state = office[0].state;
        else {
            // Return "invalid state" if the state attribute is not in the US State Abbreviations array
            if (!usStateAbbreviations.includes(req.body.state)) return "invalid state";
            else updated_office.state = req.body.state;
        }

        // Update general manager attribute if it's included in the request body.
        if (req.body.general_manager === null || req.body.general_manager === undefined) updated_office.general_manager = office[0].general_manager;
        else {
            // Return "invalid general manager" if the general manager attribute contains non alphanumeric characters and is not between 2-40 characters in length
            if (!generalManagerPattern.test(req.body.general_manager)) return "invalid general manager";
            else updated_office.general_manager = req.body.general_manager;
        }

        // Update phone number attribute if it's included in the request body.
        if (req.body.phone_number === null || req.body.phone_number === undefined) updated_office.phone_number = office[0].phone_number;
        else {
            // Return "invalid phone" if the phone attribute contains characters not typically found in a phone number
            if (!phonePattern.test(req.body.phone_number)) return "invalid phone";
            else updated_office.phone_number = req.body.phone_number;
        }
    
        // Update the office if it exists
        const s = await datastore.save({ "key": key, "data": updated_office });
        
        // Return the updated office object
        return datastore.get(key);
    } catch {
        // Return "not found" if the key check fails.
        return "not found";
    }
}

// Delete office with provided ID
async function delete_office(id){
    
    // Return "not found" if office does not exist.
    const key = datastore.key([OFFICE, parseInt(id, 10)]);
    try {
        let office = await datastore.get(key);
        if (office[0] === undefined || office[0] === null) return "not found";
    
        // Delete the office if it exists
        return datastore.delete(key);
    }
    catch {
        return "not found";
    }
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// Create an office
router.post('/', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
            post_office(req)
            .then(office => {
                res.set("Content", "application/json");
                if (office === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
                else if (office === "insufficient attributes") res.status(400).json({"Error": "The request object is missing at least one of the required attributes"});
                else if (office === "invalid company") res.status(400).json({"Error": "The request object's company attribute is not valid"});
                else if (office === "invalid city") res.status(400).json({"Error": "The request object's city attribute is not valid"});
                else if (office === "invalid state") res.status(400).json({"Error": "The request object's state attribute is not valid"});
                else if (office === "invalid general manager") res.status(400).json({"Error": "The request object's general manager attribute is not valid"});
                else if (office === "invalid phone") res.status(400).json({"Error": "The request object's phone number attribute is not valid"});
                else if (office === "company exists") res.status(403).json({"Error": "The company provided in request already exists"});
                else {
                    res.location(req.protocol + "://" + req.get('host') + req.baseUrl + "/" + office[0].id); 
                    res.status(201).json(office[0]);
                }
            });
    }
});

// Assign an employee to an office
router.put('/:oid/employees/:eid', function(req, res){
    put_assign_employee(req.params.oid, req.params.eid)
    .then( (result) => {
        if (result === "employer assigned") res.status(403).send({"Error": "The employee is already assigned a company"})
        else if (result === "not found") res.status(404).send({"Error": "The specified employee and/or office does not exist"})
        else res.status(204).json(result[0])
    }
        );
});

// Remove a load from a boat
router.delete('/:oid/employees/:eid', function(req, res){
    delete_remove_employee_from_office(req.params.oid, req.params.eid)
    .then( (result) => {
        if (result === "not assigned") res.status(404).send({"Error": "No office with this office_id is loaded with the employee with this employee_id"})
        else if (result === "not found") res.status(404).send({"Error": "The specified employee and/or office does not exist"})
        else res.status(204).json(result[0])
    }
        );
});

// Get all offices with pagination
router.get('/', function (req, res) {
    get_offices(req)
        .then((offices) => {
            res.status(200).json(offices);
        });
});

// Get an office using its ID
router.get('/:id', function (req, res) {
    get_office(req.params.id)
        .then(office => {
            if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
            else {
                if (office[0] === undefined || office[0] === null || office === "not found") {
                    // The 0th element is undefined. This means there is no office with this id
                    res.status(404).json({ 'Error': 'No office with this office_id exists' });
                } else {
                    // Return the 0th element which is the office with this id
                    res.status(200).json(office[0]);
                }
            }
        });
});

// Edit all the fields for an existing office
router.put('/:id', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
        put_office(req).then( (office) => {
            res.set("Content", "application/json");
            if (office === "not found") res.status(404).json({ 'Error': 'No office with this office_id exists' });
            else if (office === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
            else if (office === "insufficient attributes") res.status(400).json({"Error": "The request object is missing at least one of the required attributes"});
            else if (office === "invalid company") res.status(400).json({"Error": "The request object's company attribute is not valid"});
            else if (office === "invalid city") res.status(400).json({"Error": "The request object's city attribute is not valid"});
            else if (office === "invalid state") res.status(400).json({"Error": "The request object's state attribute is not valid"});
            else if (office === "invalid general manager") res.status(400).json({"Error": "The request object's general manager attribute is not valid"});
            else if (office === "invalid phone") res.status(400).json({"Error": "The request object's phone number attribute is not valid"});
            else if (office === "company exists") res.status(403).json({"Error": "The company provided in request already exists"});
            else {
                res.location(req.protocol + "://" + req.get('host') + req.baseUrl + "/" + office[0].id); 
                res.status(303).json(office[0]);
            }
        });
    }
});

// Edit one or many of the fields for an existing office
router.patch('/:id', function (req, res) {
    if (req.get('content-type') !== 'application/json') res.status(415).json({"Error": 'Server only accepts application/json data.'});
    else {
        patch_office(req).then( (office) => {
            res.set("Content", "application/json");
            if (office === "not found") res.status(404).json({ 'Error': 'No office with this office_id exists' });
            else if (office === "invalid attribute") res.status(400).json({"Error": "The request object contains an invalid attribute"});
            else if (office === "insufficient attributes") res.status(400).json({"Error": "The request object is missing at least one of the required attributes"});
            else if (office === "invalid company") res.status(400).json({"Error": "The request object's company attribute is not valid"});
            else if (office === "invalid city") res.status(400).json({"Error": "The request object's city attribute is not valid"});
            else if (office === "invalid state") res.status(400).json({"Error": "The request object's state attribute is not valid"});
            else if (office === "invalid general manager") res.status(400).json({"Error": "The request object's general manager attribute is not valid"});
            else if (office === "invalid phone") res.status(400).json({"Error": "The request object's phone number attribute is not valid"});
            else if (office === "company exists") res.status(403).json({"Error": "The company provided in request already exists"});
            else res.status(200).json(office[0]);
        });
    }
});

// Delete a office
router.delete('/:id', function(req, res){
    delete_office(req.params.id).then( (result) => {
        if (result === "not found") res.status(404).json({ 'Error': 'No office with this office_id exists' });
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

// Return 405 status code for PATCH on root URL
router.patch('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).json({"Error": "Not Acceptable"});
});

/* ------------- End Controller Functions ------------- */

module.exports = router;