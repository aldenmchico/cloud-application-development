// Variables for OAuth2.0
const CLIENT_ID = '419827712356-0k6bd5i1ofldiac9ctdq19g1c6fh7413.apps.googleusercontent.com';
const LOCAL_REDIRECT_URI = 'http://localhost:8080/oauth'
const REMOTE_REDIRECT_URI = 'https://chicoa-oauth.wl.r.appspot.com/oauth';


// Create a 40 character random state variable
function createState() {
    let validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomState = ''
    for (let i=0; i < 40; i++) randomState += validChars.charAt(Math.floor(Math.random() * validChars.length));
    return randomState;
  }
  
  // Create an OAuth Request URI
function createAuthRequestURI(state) {
    const client_id = CLIENT_ID;
    const response_type = 'code';
    const scope = 'https://www.googleapis.com/auth/userinfo.profile';
    const redirect_uri =  REMOTE_REDIRECT_URI;
  
    let auth_request_uri = 'https://accounts.google.com/o/oauth2/v2/auth';
    auth_request_uri += '?'
    auth_request_uri += 'client_id=' + client_id + '&';
    auth_request_uri += 'response_type=' + response_type + '&';
    auth_request_uri += 'scope=' + scope + '&';
    auth_request_uri += 'redirect_uri=' + redirect_uri + '&';
    auth_request_uri += 'state=' + state + '&';
    auth_request_uri += 'access_type=offline' + '&';
    auth_request_uri += 'prompt=consent';

    return auth_request_uri;
}

// Create a link element with the Google OAuth2.0 Endpoint and add to website
const linkElement = document.createElement("a");
const state = createState();
const completeURI = REMOTE_REDIRECT_URI + '/state'

// Save the state variable to Google Datastore by POSTing to /oauth/state
fetch(completeURI, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    state:`${state}`
  })
}).then(
  () => {
    linkElement.href = createAuthRequestURI(state);
    linkElement.textContent = "Visit Google OAuth 2.0 Endpoint"
    document.body.appendChild(linkElement);
  }
)




