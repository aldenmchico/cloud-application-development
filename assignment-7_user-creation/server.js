// Import modules
const STATE = "State";
const axios = require('axios');
const qs = require('qs');
const request = require('request');
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

const TOKEN = process.env.TOKEN;
const authToken = 'Bearer ' + TOKEN;

// Create a user and display the JWT on the web client
app.post('/users', async (req, res) => {
  
  let postData = {
    "email": `${req.body.email}`, //
    "user_metadata": {},
    "blocked": false,
    "email_verified": true,
    "app_metadata": {},
    "connection": "Username-Password-Authentication",
    "password": `${req.body.password}`, //
    "verify_email": false
  }
  try {
    // Create an account in Auth0
    let response = await axios.post('https://dev-0l4uoy66btverczd.us.auth0.com/api/v2/users', postData, 
    {headers: {'Content-Type': 'application/json', 'Authorization': `${authToken}`}});
    postData = {
      "username": `${req.body.email}`,
      "password": `${req.body.password}`
    }
    try {
      // Generate an ID token that can be used for authorization
      const URL = process.env.GOOGLE_DOMAIN + '/login'
      response = await axios.post(URL, postData, {headers: {'Content-Type': 'application/json'}})
      res.status(200).send(`
      <li>Access Token: ${response.data.access_token}</li>
      <li>ID Token: ${response.data.id_token}</li>
      <li>Scope: ${response.data.scope}</li>
      <li>Expires In: ${response.data.expires_in}</li>
      <li>Token Type: ${response.data.token_type}</li>
      <a href='/'> Return to Create Account Page </a>
      `)
      
    } catch {
      res.status(401).send(
        `<p>Error creating authorization token</p>
        <a href='/'> Return to Create Account Page </a>`
      )
    }
  } catch {
    res.status(401).send(
      `<p>Error processing account creation...</p>
      <a href='/'> Return to Create Account Page </a>`
    )
  }
})

const DOMAIN = process.env.DOMAIN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Create a JWT with the supplied credentials
app.post('/login', function(req, res){
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

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => { 
  console.log(`Server listening on port ${PORT}...`);
}); 