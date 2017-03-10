# INUTILE
Http server that exec cmd and use redis to host/url mapping, started to test [gravity-lang](https://marcobambini.github.io/gravity/) as server language. You can use a middleware feature to create a chain of functions

### Requirements
Node.JS and redis

### Install
`clone the repo`    
`npm install`     
`node app.js`     

### Env Variables
Create in the repository root a .env file with this config:
```
EXEC_CMD=./gravity
PORT=3000
```

### Add host routing
Must add redis key in hash with this format: vhost:HOSTNAME:URL     
Example:      
`redis-cli`     
`hset vhost:localhost:3000:/ path /path/to/my/files/directory`     
`hset vhost:localhost:3000:/ file myfile.ext`      

### Gravity basic example
- Follow the [gravity install guide](https://marcobambini.github.io/gravity/getting-started.html) for start
- After you have cloned and make gravity (suppose that we clone it in /home/myuser/gravity), create an example file (mytest.gravity) in the gravity directory with your code
- Add rules in redis     
`hset vhost:localhost:3000:/ path /home/myuser/gravity`     
`hset vhost:localhost:3000:/ file mytest.gravity`     
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
`hset vhost:localhost:3000:/ciao path /home/myuser/gravity`     
`hset vhost:localhost:3000:/ciao file mymid.gravity,mytest.gravity`     
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

### License
MIT
