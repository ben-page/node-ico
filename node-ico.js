var Promise = require('bluebird');
var Buffer = require('buffer').Buffer;
var fs = require('fs');

if (process.argv.length < 4) {
    console.error('arguments: output.ico input1.png input2.png ...');
    process.exit();
}

var output = process.argv[2];

var inputs = process.argv.slice(3);

var readFile = Promise.promisify(fs.readFile, fs);
var writeFile = Promise.promisify(fs.writeFile, fs);

var parse = function (fileName) {
    return readFile(fileName, undefined)
        .then(function (buf) {
            var offset = 8; //skip header

            var data = {
                name: fileName,
                buffer: buf,
                width: undefined,
                height: undefined,
                paletteCount: undefined
            };

            while (data.width === undefined || data.paletteCount === undefined) {
                var length = buf.readUInt32BE(offset);
                offset += 4;
                var type = buf.toString('ASCII', offset, offset + 4);
                offset += 4;

                switch (type) {
                    case 'IHDR':
                        data.width = buf.readUInt32BE(offset);
                        data.height = buf.readUInt32BE(offset + 4);
                        var colorType = buf.readInt8(offset + 9);

                        if (colorType !== 3)
                            data.paletteCount = 0;

                        break;
                    case 'PLTE':
                        data.paletteCount = length / 3;
                        break;
                }
                offset += length + 4; //4 = CRC
            }

            return data;
        });
};

var files = [];

for (var i = 0; i < inputs.length; i++) {
    files.push(parse(inputs[i]));
}

Promise.all(files)
    .then(function (files) {
        var i, file, total = 0;
        for (i = 0; i < files.length; i++) {
            file = files[i];

            total += file.buffer.length;
        }

        var headerBytes = 6 + (16 * files.length);
        var buf = new Buffer(total + headerBytes);
        var index = 0;

        function writeUInt8(value) {
            buf.writeUInt8(value, index);
            index++;
        }

        function writeUInt16LE(value) {
            buf.writeUInt16LE(value, index);
            index += 2;
        }

        function writeUInt32LE( value) {
            buf.writeUInt32LE(value, index);
            index += 4;
        }

        //ICONDIR
        writeUInt16LE(0); //Reserved
        writeUInt16LE(1); //type = ICO
        writeUInt16LE(files.length); //number of images

        var fileOffset = headerBytes;
        //ICONDIRENTRY
        for (i = 0; i < files.length; i++) {
            file = files[i];
            writeUInt8(file.width === 256 ? 0 : file.width);
            writeUInt8(file.height === 256 ? 0 : file.height);
            writeUInt8(file.paletteCount);
            writeUInt8(0); //reserved
            writeUInt16LE(0); //color planes
            writeUInt16LE(0); //bits per pixel - let the viewer decide from PNG file
            writeUInt32LE(file.buffer.length); //image size
            writeUInt32LE(fileOffset);

            file.buffer.copy(buf, fileOffset);

            fileOffset += file.buffer.length;
        }

        return writeFile(output, buf);
    })
    .then(function () {
        console.log('done');
    });



