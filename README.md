# INUTILE
Http server that exec cmd and use redis to host/url mapping, started to test [gravity-lang](https://marcobambini.github.io/gravity/) as server language.

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

### License
MIT
