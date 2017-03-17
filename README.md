# INTERSTELLAR
HTTP server that exec cmd and use redis to host/url mapping, started to test [gravity-lang](https://marcobambini.github.io/gravity/) as server language, then the idea is evolved. You can use middleware feature as chain of functions. Tested with: golang, gravity, rust and php.     
It's an experiment to define a flexible microservices proxy. Microservices run as commands and are in files, so you can use flexible language, no needs hot reload, share middleware from different project, easy deploy.      

### Features
- multiple languages backend
- middlewares (different languages too)
- not reload for new codes
- status health check
- maintenance mode for single route
- custom response content type

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
```

### Add host routing
Must add redis key in hash with this format: vhost:HOSTNAME:URL     
Example:      
`redis-cli`     
`hset vhost:localhost:3000:/ commands "command1,command2,..."`      
`hset vhost:localhost:3000:/ method GET`      

### Gravity basic example
- Follow the [gravity install guide](https://marcobambini.github.io/gravity/getting-started.html) for start
- After you have cloned and make gravity (suppose that we clone it in /home/myuser/gravity), create an example file (mytest.gravity) in the gravity directory with your code
- Add rules in redis     
`hset vhost:localhost:3000:/ method GET`      
`hset vhost:localhost:3000:/ commands "cd /home/myuser/gravity && ./gravity mytest.gravity"`      
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
`hset vhost:localhost:3000:/ciao method GET`      
`hset vhost:localhost:3000:/ciao commands "cd /home/myuser/gravity && ./gravity mymid.gravity,cd /home/myuser/gravity && ./gravity mytest.gravity"`      
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
`hset vhost:localhost:3000:/ciao method POST`       
`hset vhost:localhost:3000:/ciao commands "cd /home/myuser/rust && ./mid,cd /home/myuser/rust ./main"`      
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
`hset vhost:localhost:3000:/ciao method GET`       
`hset vhost:localhost:3000:/ciao commands "cd /home/myuser/rust && ./mid,cd /home/myuser/rust ./main"`      
- Test with curl    
`curl http://localhost:3000/ciao?foo=bar`     
You should see in the response the querystring and the middleware's stdout

### Setup response content type header (optional)
You can setup response content type header with this redis hset:    
`hset vhost:localhost:3000:/ciao content_type application/json`    

### STATUS HEALTH CHECK (optional)
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
Example with path status:
```
HEALTH_CHECK=true
HEALTH_CHECK_TYPE=path
HEALTH_CHECK_MATCH=/interstellar/status
```

### Route maintenance monde (optional)
You can set a maintenance mode for route if necessary, add in redis for route:    
`hset vhost:localhost:3000:/ maintenance true`    
Disable maintenance with:   
`hdel vhost:localhost:3000:/ maintenance`    

### License
MIT
