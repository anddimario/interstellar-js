# INTERSTELLAR
Http server that exec cmd and use redis to host/url mapping, started to test [gravity-lang](https://marcobambini.github.io/gravity/) as server language. You can use middleware feature as chain of functions. Tested with: gravity, rust, php and bash.     
It's an experiment to define a flexible microservices proxy.    

### Requirements
Node.JS and redis

### Install
`clone the repo`    
`npm install`     
`node app.js`     

### Env Variables
Create in the repository root a .env file with this config:
```
PORT=3000
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
- See that if the middleware return true, the exec was blocked

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
- Try to write main.rs as mid.rs to use args, you can see that also the mid stdout is passed to main

### License
MIT
