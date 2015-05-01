let http = require('http')
let fs = require('fs')
let path = require('path')
let Promise = require('songbird')

let errorHandler = e => console.log(e.stack)
let root = '/'

let traverseFolder = (currentPath, parentFolder) => {
    return new Promise( (resolve) => {
        fs.promise.readdir(currentPath)
            .then((files) => {
                let currentFolder = []
                let folder = {}
                folder[currentPath] = currentFolder
                // { path: [filename, subFolder: [...] ] }
                parentFolder.push(folder)

                Promise.all(files.map((filename) => {
                        return fs.promise.stat(path.join(currentPath, filename))
                    }))
                    .then((stats) => {
                        var promises = []
                        let allFiles = (files.filter((filename, index) => {
                            if (stats[index].isDirectory()) {
                                promises.push(traverseFolder(path.join(currentPath, filename), currentFolder))
                            } else {
                                currentFolder.push(filename)
                                promises.push(Promise.resolve(filename))
                            }
                        }))

                        resolve(Promise.all(promises))
                    })
                    .catch(errorHandler)
            })
            .catch(errorHandler)
    })
}

http.createServer((req,res) => {
    console.log('listing folder', req.url)
    let rootDir = req.url

    let files = []
    traverseFolder(rootDir, files)
        .then(() => {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(`${JSON.stringify(files)}\n`)
        })
        .catch((error) => {
            console.log(error.stack)
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain')
            res.end(`${JSON.stringify(error.stack)}\n`)  
        })

}).listen(8000, '127.0.0.1')

console.log('Server running at http://127.0.0.1:8000/')
