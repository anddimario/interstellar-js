# INTERSTELLAR
HTTP server that exec code and use redis to host/url mapping, started to test [gravity-lang](https://marcobambini.github.io/gravity/) as server language, then the idea is evolved. You can use middleware feature as chain of functions. Tested with: golang, gravity, rust and php.     
It's an experiment to define a flexible microservices proxy. Microservices run as commands and are in files, so you can use flexible language, no needs hot reload, share middleware from different project, easy deploy.      

### Features
- multiple languages backend
- middlewares (different languages too)
- code stored in redis
- not reload for new codes
- status health check
- maintenance mode for single route
- custom response content type
- process only if status is setted ready
- ping health check
- trigger that exec commands

### Requirements
Node.JS v4 and redis

### Install
`git clone git@github.com:anddimario/interstellar.git`    
`npm install`     
`node app.js`     

### Env Variables
Create in the directory root a .env file with this config:
```
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
INITIAL_STATUS=ready
```

### Initial status
When an Interstellar instance starts, it sets a redis variable in the form: 
`interstellar:instances:HOSTNAME`, initialize this variable with `INITIAL_STATUS` and set a ttl (60 sec), useful to check instance health status.    
In .env the `INITIAL_STATUS` is used to manage the possibility to process the request, default is `ready` so, when started, the instance could serve the request immediately, but you can set this status as you want. For example, a scenario where you mount your compiled files from a shared disk and you want wait this mount and, only then, serve the request. You can set `INITIAL_STATUS` as `waiting`, so, when the istance starts, the instance doesn't serve request and then, when you mount the disk, you could set the status as `ready` in redis with:     
`set interstellar:instances:HOSTNAME ready`     
Another scenario is when you deploy commit that affect more files and you want disable routing for single instance, indifferently from your `INITIAL_STATUS`, you can set status as `waiting` in redis with:     
`set interstellar:instances:HOSTNAME waiting`    
When done, allow request with:     
`set interstellar:instances:HOSTNAME ready`     

### Add host routing
Must add redis key in hash with this format: interstellar:vhost:HOSTNAME:URL     
Example:      
`redis-cli`     
`hset interstellar:vhost:localhost:3000:/ commands "command1,command2,..."`      
`hset interstellar:vhost:localhost:3000:/ method GET`      

### Gravity basic example
- Follow the [gravity install guide](https://marcobambini.github.io/gravity/getting-started.html) for start
- After you have cloned and make gravity (suppose that we clone it in /home/myuser/gravity), create an example file (mytest.gravity) in the gravity directory with your code
- Add rules in redis     
`hset interstellar:vhost:localhost:3000:/ method GET`      
`hset interstellar:vhost:localhost:3000:/ commands "cd /home/myuser/gravity && ./gravity mytest.gravity"`      
- Test with curl    
`curl http://localhost:3000/`

### Gravity advanced example (use middleware)
Extend the basic example with middleware usage   
- Create a new gravity file in the same path of mytest.gravity, we can call it mymid.gravity, with this basic code:
```
func main () {
  return "ok" 
}
```
- Then we can add a route for this, with:     
`hset interstellar:vhost:localhost:3000:/ciao method GET`      
`hset interstellar:vhost:localhost:3000:/ciao commands "cd /home/myuser/gravity && ./gravity mymid.gravity,cd /home/myuser/gravity && ./gravity mytest.gravity"`      
*Note* The function order is important, and use commas to separate them
- Test with curl    
`curl http://localhost:3000/ciao`     
- Try now to modify mymid.gravity as:     
```
func main () {
  return false 
}
```
- Test again with curl    
`curl http://localhost:3000/ciao`     
- See that if the middleware return false, the exec was blocked
*IMP* Exec is blocked if middleware return false in stdout, or return no empyt stderr, or there's an error

### Body (POST) and querystring (GET) (Example based on rust)
To show how use body (POST) or querystring (GET) requests, here an example in rust
- Create two files, mid.rs:
```
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    // The first argument is the path that was used to call the program.
    println!("My path is {}.", args[0]);

    // The rest of the arguments are the passed command line parameters.
    // Call the program like this:
    //   $ ./args arg1 arg2
    println!("I got {:?} arguments: {:?}.", args.len() - 1, &args[1..]);
}
```
and main.rs with:
```
fn main() {
    println!("Ciao");
}
```
- Compile them, then add routing:    
`hset interstellar:vhost:localhost:3000:/ciao method POST`       
`hset interstellar:vhost:localhost:3000:/ciao commands "cd /home/myuser/rust && ./mid,cd /home/myuser/rust ./main"`      
- Test with curl    
`curl -d "Ciao" http://localhost:3000/ciao`     
- Body (and querystring) is propagated in each command as argument
- Try to write main.rs as mid.rs to use args, you can see that also the mid stdout is passed to main, see the specific example below

### Middleware chained informations (Example with GET, querystring and golang)
- Create two files, mid.go:
```
package main

import "fmt"

func main() {
	fmt.Print("ciao")
}
```
and main.go:
```
package main

import (
	"fmt"
	"os"
)

func main() {
	argsWithoutProg := os.Args[1:]
	fmt.Println(argsWithoutProg)
}
```
- Compile them, then add routing:    
`hset interstellar:vhost:localhost:3000:/ciao method GET`       
`hset interstellar:vhost:localhost:3000:/ciao commands "cd /home/myuser/rust && ./mid,cd /home/myuser/rust ./main"`      
- Test with curl    
`curl http://localhost:3000/ciao?foo=bar`     
You should see in the response the querystring and the middleware's stdout

### Arguments and order passed to commands
Arguments are passed to commands with this order:    
`COMMAND HOSTNAME BODY/QUERYSTRING MIDDLEWARE_STDOUT`     
Where:
- HOSTNAME: is the hostname from request that you can use to reference for example for find a specific configuration   
- BODY/QUERYSTRING: is the request body (POST) or querystring (GET), both are in json stringify format (optional) 
- MIDDLEWARE_STDOUT: is the output for middlewares (optional)

### Code from redis (example with php)
In redis run this commands:
```
hset interstellar:vhost:localhost:3000:/redis commands "echo CUSTOM_CODE | php"
hset interstellar:vhost:localhost:3000:/redis method GET
hset interstellar:vhost:localhost:3000:/redis code "<?php \\$i=5+2; echo 'Response from HOSTNAME is: '.\\$i;"
```
Then with curl: `curl localhost:3000/redis`    
__IMP__ Note that `HOSTNAME` is replaced from interstellar and `CUSTOM_CODE` in commands is where interstellare replace your code

### Setup response content type header (optional)
You can setup response content type header with this redis hset:    
`hset interstellar:vhost:localhost:3000:/ciao content_type application/json`    

### Status health check (optional)
Add in .env:
```
HEALTH_CHECK=true
HEALTH_CHECK_TYPE=
HEALTH_CHECK_MATCH=
```
Where `HEALTH_CHECK_TYPE` could be:
- *path*: if the reference is request.url
- *user-agent* if the reference is the client agent    

Example with user-agent (aws elb health check):
```
HEALTH_CHECK=true
HEALTH_CHECK_TYPE=user-agent
HEALTH_CHECK_MATCH=ELB-HealthChecker/1.0
```
Example with path:
```
HEALTH_CHECK=true
HEALTH_CHECK_TYPE=path
HEALTH_CHECK_MATCH=/interstellar/status
```

### Route maintenance mode (optional)
You can set a maintenance mode for route if necessary, add in redis for route:    
`hset interstellar:vhost:localhost:3000:/ maintenance true`    
Disable maintenance with:   
`hdel interstellar:vhost:localhost:3000:/ maintenance`    

### Custom system messages (optional)
Define a custom content type response in .env with:    
`CUSTOM_RESPONSE_TYPE=`     
Then there are this defaults messages that you can customize with a variable in .env:    
- *redis error*: `MESSAGES_REDIS_ERROR` back when a redis error occurs   
- *not ready*: `MESSAGES_NOT_READY_ERROR` back when the application state is not ready   
- *UP*: `MESSAGES_HEALTH_OK` back from interstellar health check    
- *not found*: `MESSAGES_NOT_FOUND` back when route not found    
- *maintenance*: `MESSAGES_MAINTENANCE_ACTIVE` back if maintenance is active for route

### Triggers
You can set a trigger that exec a commands when the thresold is reached, for example create a trigger with this command in redis:    
`set interstellar:triggers:my_great_trigger '{"min":5,"key":"interstellar:variables:triggers:test","thresold":5,"command":"touch /tmp/alert","global":true}'`     
In this way you have defined a trigger that exec `touch /tmp/alert` if there are 5 global request in 5 minutes.    
Options:
- `min`: the interval in minutes used to reference for trigger count that is refreshed when the time expire
- `key`: the temporary key used to store the count for this trigger
- `thresold`: when this count is reached the command is fired
- `command`: the command to fire when thresold is reached
- `global`: if it is setted as true, it's a global trigger that refer to all requests in all instances and for all sites (optional)
- `instance`: in the form: "instance":"hostname", it is used to watch requests for a specific instance (optional)
- `status`: for example: "status":200, it is used to fire trigger when the thresold based on request status is reached (optional)
- `site`: for example: "site":"example.com", watch the requests for a specific site

### Errors logs
They are stored in redis in the form: `interstellar:logs:INSTANCE:TIMESTAMP string`

### Stats
You can see them in redis with: `KEYS interstellar:stats:*`     
Stats are for status code, instance, sites and in general.

### Security
For security reason you can run commands using containers, or try: [nsjail](https://github.com/google/nsjail)    
Example: `nsjail -Mo --chroot / -q -- /path/to/your/file args`

### Example application
- [Microblog](https://github.com/anddimario/interstellar-microblog)

### License
MIT
