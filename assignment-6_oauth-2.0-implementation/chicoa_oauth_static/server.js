// Import modules
const ds = require('./datastore');
const datastore = ds.datastore;
const STATE = "State";
const axios = require('axios');
const qs = require('qs');
require('dotenv').config()


// Express requirements
const express = require("express");
const app = express();
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}));
app.use(express.static('public'));
app.enable('trust proxy'); // Enables https protocol

// Save the generated state variable to Google Datastore
app.post('/oauth/state', async (req, res) => {
  const state = req.body.state;
  var key = datastore.key(STATE);
  const new_state = {"state": state};
  await datastore.save({"key":key, "data":new_state});
  res.status(201).end();
})

// Check that the state from the Google server in req.query.state matches the state saved on Datastore
app.get('/oauth/state', async (req, res) => {
  const query = datastore.createQuery(STATE).filter('state', '=', req.query.state);
  results = await datastore.runQuery(query);
  if (results.length > 0) res.status(200).end();
  else res.status(400).end();
})

// Perform OAuth2.0 client/server checks and retrieve data from Google's server
app.get('/oauth', async (req, res) => {

  // Pull state and code from request query parameters
  const state = req.query.state
  const code = req.query.code

  // Check that the client's state variable matches the server's state variable
  const completeURI = process.env.REMOTE_REDIRECT_URI + '/state?state=' + req.query.state;
  let response = axios.get(completeURI, {headers: {'Content-Type': 'application/json'}})
  if (response.status == 400) {
    res.status(400).send("Client and Server state variables did not match")
  }
  else {
  // POST to https://oauth2.googleapis.com/token to receive an access token
  const postData = {
    code: code,
    client_id:process.env.CLIENT_ID,
    client_secret:process.env.CLIENT_SECRET,
    redirect_uri: process.env.REMOTE_REDIRECT_URI,
    grant_type:"authorization_code"
  }
  response = await axios.post('https://oauth2.googleapis.com/token', qs.stringify(postData), 
    {headers: {'Content-Type': 'application/x-www-form-urlencoded'}});
  const access_token = response.data.access_token;

  // Use the access token to retrieve data from Google server
  response = await axios.get(`https://people.googleapis.com/v1/people/me?personFields=names&access_token=${access_token}`);
  res.send(`
  <li>State: ${state}</li>
  <li>First Name: ${response.data.names[0].givenName}</li>
  <li>Last Name: ${response.data.names[0].familyName}</li>
  `)
  }

})

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => { 
  console.log(`Server listening on port ${PORT}...`);
}); 