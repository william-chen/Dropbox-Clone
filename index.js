let fs = require('fs')
let path = require('path')
let net = require('net')
let mime = require('mime-types')
let express = require('express')
let morgan = require('morgan')
let nodeify = require('bluebird-nodeify')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')
let argv = require('yargs')
	.default('dir', process.cwd())
	.argv
let jot = require('json-over-tcp')
let bodyParser = require('body-parser')

require('songbird')

const NODE_ENV = process.env.NODE_ENV
const PORT = process.env.PORT || 8000
const TCP_PORT = 1234
const DROPBOX_TCP_PORT = 2345
const ROOT_DIR = path.resolve(argv.dir)

if (NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// Create TCP listener for initial sync request
let server = jot.createServer(DROPBOX_TCP_PORT)
server.on('connection', syncHandler)

function syncHandler(socket) {
	socket.on('data', (data)=>{
		console.log(JSON.stringify(data))
		//TODO: sync existing files to client
	})
}
server.listen(DROPBOX_TCP_PORT)

let app = express()
// assume we only take text string files
app.use(bodyParser.text())


let socket = new jot.Socket(new net.Socket())

app.listen(PORT, ()=> console.log(`Dropbox server listening @ http://127.0.0.1:${PORT}`))

app.get('*', setFileMeta, sendHeaders, (req, res) => {
	if (res.body) {
		res.json(res.body)
		return
	}
 	fs.createReadStream(req.filePath).pipe(res)
})

app.head('*', setFileMeta, sendHeaders, (req, res, next) => {
	res.end()
})

app.delete('*', setFileMeta, (req, res, next) => {
	async ()=> {
		if (!req.stat) return res.send(400, 'invalid path')
		if (req.stat && req.stat.isDirectory()) {
			await rimraf.promise(req.filePath)
			await serverPush("delete", req.filePath, "dir", null)
		} else {
			await fs.promise.unlink(req.filePath)
			await serverPush("delete", req.filePath, "file", null)
		}
		res.end()
	}().catch(next)
})

app.put('*', setFileMeta, setDirDetails, (req, res, next) => {
	async ()=> {
		if (req.stat) return res.send(405, 'File exists')
		await mkdirp.promise(req.dirPath)
		if (!req.isDir) {
			//req.pipe(fs.createWriteStream(req.filePath))
			await fs.promise.writeFile(req.filePath, req.body)
			await serverPush("create", req.filePath, "file", req.body)
		} else {
			await serverPush("create", req.dirPath, "dir", null)
		}
		res.end()
	}().catch(next)
})

app.post('*', setFileMeta, setDirDetails, (req, res, next) => {
	async ()=> {
		if (!req.stat) return res.send(405, 'File does not exist')
		if (req.isDir) return res.send(405, 'Path is a directory')
		await fs.promise.truncate(req.filePath, 0)
		//req.pipe(fs.createWriteStream(req.filePath))
		await fs.promise.writeFile(req.filePath, req.body)
		await serverPush("update", req.filePath, "file", req.body)
		res.end()
	}().catch(next)
})

// Utility function to send server push over TCP
async function serverPush(action, filePath, type, contents) {
	let fileContent = contents
	if (fileContent != null) {
		fileContent = fileContent.toString('base64')
	}
	let payload = {
		"action": action,
		"path": filePath,
		"type": type,
		"contents": fileContent,
		"updated": new Date().getTime()
	}
	socket.connect(TCP_PORT)
	await socket.promise.on('connect')
	socket.end(payload)
}

// Middleware Functions
function setDirDetails(req, res, next) {
	let filePath = req.filePath
	let endsWithSlash = filePath.charAt(filePath.length-1) === path.sep
	let hasExt = path.extname(filePath) !== ''
	req.isDir = endsWithSlash || !hasExt
	req.dirPath = req.isDir ? filePath : path.dirname(filePath)
	next()
}

function setFileMeta(req, res, next) {
	req.filePath = path.resolve(path.join(ROOT_DIR, req.url))
  	if (req.filePath.indexOf(ROOT_DIR) != 0) {
  		res.send(400, 'invalid path')
  		return
  	}
  	fs.promise.stat(req.filePath)
  	  .then(stat => req.stat = stat, () => req.stat = null)
  	  .nodeify(next)
}

function sendHeaders(req, res, next) {
	nodeify(async () => {
  		if (req.stat.isDirectory()) {
  			let files = await fs.promise.readdir(req.filePath)
  			res.body = JSON.stringify(files)
  			res.setHeader('Content-Length', res.body.length)
  			res.setHeader('Content-Type', 'application/json')
  			return
  		}

  		res.setHeader('Content-Length', req.stat.size)
  		let contentType = mime.contentType(path.extname(req.filePath))
  		res.setHeader('Content-Type', contentType)
  		
  	}(), next)
}

