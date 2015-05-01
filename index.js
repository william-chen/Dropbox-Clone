let http = require('http')
let fs = require('fs')
let path = require('path')
let Promise = require('songbird')

let errorHandler = e => console.log(e.stack)
let root = '/'

let traverseFolder = (currentPath) => {
    return new Promise( (resolve) => {
        fs.promise.readdir(currentPath)
            .then((files) => {
                Promise.all(files.map((filename) => {
                        return fs.promise.stat(path.join(currentPath, filename))
                    }))
                    .then((stats) => {
                        var promises = []
                        let allFiles = (files.filter((filename, index) => {
                            if (stats[index].isDirectory()) {
                                promises.push(traverseFolder(path.join(currentPath, filename)))
                            } else {
                                promises.push(Promise.resolve(filename))
                            }
                        }))

                        Promise.all(promises).then((files) =>{
                            console.log('files', files)
                            let folderStructure = {}
                            folderStructure[currentPath] = files
                            resolve(folderStructure)
                        })
                    })
                    .catch(errorHandler)
            })
            .catch(errorHandler)
    })
}

http.createServer((req,res) => {
    console.log('listing folder', req.url)
    let rootDir = req.url

    traverseFolder(rootDir)
        .then((folderStructure) => {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(`${JSON.stringify(folderStructure)}\n`)
        })
        .catch((error) => {
            console.log(error.stack)
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain')
            res.end(`${JSON.stringify(error.stack)}\n`)  
        })

}).listen(8000, '127.0.0.1')

console.log('Server running at http://127.0.0.1:8000/')
