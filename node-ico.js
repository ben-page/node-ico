/* eslint-disable no-process-exit */
const Buffer = require('buffer').Buffer;
const fs = require('fs');

if (process.argv.length < 4) {
    console.error('arguments: output.ico input1.png input2.png ...');
    process.exit();
}

const output = process.argv[2];

const inputs = process.argv.slice(3);

const readFile = (path, options) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, options, (err, data) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(data);
        });
    });
};

const writeFile = (file, path, options) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, path, options, err => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
};

const parse = function (fileName) {
    return readFile(fileName, undefined)
        .then(buf => {
            let offset = 8; //skip header

            const data = {
                name: fileName,
                buffer: buf,
                width: undefined,
                height: undefined,
                paletteCount: undefined
            };

            while (data.width === undefined || data.paletteCount === undefined) {
                const length = buf.readUInt32BE(offset);
                offset += 4;
                const type = buf.toString('ASCII', offset, offset + 4);
                offset += 4;

                switch (type) {
                    case 'IHDR':
                        data.width = buf.readUInt32BE(offset);
                        data.height = buf.readUInt32BE(offset + 4);
                        const colorType = buf.readInt8(offset + 9);

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


(async function () {
    let total = 0;
    const files = [];

    for (let i = 0; i < inputs.length; i++) {
        const file = await parse(inputs[i]);
        files.push(file);
        total += file.buffer.length;
    }

    const headerBytes = 6 + (16 * files.length);
    const buf = Buffer.alloc(total + headerBytes);
    let index = 0;

    const writeUInt8 = value => {
        buf.writeUInt8(value, index);
        index++;
    };

    const writeUInt16LE = value => {
        buf.writeUInt16LE(value, index);
        index += 2;
    };

    const writeUInt32LE = value => {
        buf.writeUInt32LE(value, index);
        index += 4;
    };

    //ICONDIR
    writeUInt16LE(0); //Reserved
    writeUInt16LE(1); //type = ICO
    writeUInt16LE(files.length); //number of images

    let fileOffset = headerBytes;
    //ICONDIRENTRY
    for (const file of files) {
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

    await writeFile(output, buf);

    console.log('done');
})();
