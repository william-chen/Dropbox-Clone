let net = require('net')
let path = require('path')
let fs = require('fs')
let jot = require('json-over-tcp')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')
let argv = require('yargs')
	.default('dir', process.cwd())
	.argv

require('songbird')

const TCP_PORT = 1234
const DROPBOX_TCP_PORT = 2345
const ROOT_DIR = path.resolve(argv.dir)
const SERVER_DIR = path.resolve(path.normalize(process.cwd() + '/..'))
console.log(ROOT_DIR)

// Create TCP Server
let clientServer = jot.createServer(TCP_PORT)
clientServer.on('connection', newConnectionHandler)

// Dropbox TCP client for initial sync on start
let socket = new jot.Socket(new net.Socket())
socket.connect(DROPBOX_TCP_PORT)
socket.on('connect', ()=>{
	socket.write({location: ROOT_DIR})
	socket.on('data', (data) => {
		console.log(JSON.stringify(data))
	})
})

// When something connects to client server
function newConnectionHandler(socket) {
	
	// make initial sync signal when connection started
	socket.on('data', (data) => {
		let payload = JSON.stringify(data)
		console.log('received incoming data: ' + payload)
		let fileNames = data.path.split('/')
		let fileName = fileNames[fileNames.length-1]
			
		switch(data.action){
			case 'update':
				updateFile(data.path, fileName); 
				break;
			case 'create':
				createNewFile(data.type, data.path, fileName);
				break;
			case 'delete':
				// if it's a folder, would be a folder name
				deleteFile(data, fileName)
				break;
			default:
		}
	})

	socket.on('error', (error) => {
		console.log(error)
	})
}

function updateFile(filePath, fileName){
	async() => {
		let fileData = await fs.promise.readFile(filePath)
		let clientFilePath = path.join(ROOT_DIR, fileName)
		await fs.promise.truncate(clientFilePath, 0)
		await fs.promise.writeFile(clientFilePath, fileData)
	}().catch(e => console.log(e))
}

function createNewFile(fileType, filePath, fileName){
	async() => {
		if (fileType == "file") {
			let fileData = await fs.promise.readFile(filePath)
			let clientFilePath = path.join(ROOT_DIR, fileName)
			await fs.promise.writeFile(clientFilePath, fileData)
		} else {
			await mkdirp.promise(path.join(ROOT_DIR, fileName))
		}
	}().catch(e => console.log(e))
}

function deleteFile(data, fileName){
	async() => {
		if (data.type == 'dir') {
			await rimraf.promise(path.join(ROOT_DIR,fileName))
		} else {
			await fs.promise.unlink(path.join(ROOT_DIR,fileName))
		}
	}().catch(e => console.log(e))	
}

clientServer.listen(TCP_PORT)
console.log('Starting the client TCP server...')