import * as path from "path";
import * as fs from "fs";
import { getVideoDurationInSeconds } from "get-video-duration";
import prettyBytes from "pretty-bytes";
import prettyMilliseconds from "pretty-ms";
import { createObjectCsvWriter } from "csv-writer";
import { ObjectCsvWriterParams } from "csv-writer/src/lib/csv-writer-factory";
import { ExifImage } from "exif";
import { ObjectMap } from "csv-writer/src/lib/lang";
import * as async from "async";
require("dotenv").config();
const directoryRoot = (process.env.FOLDERS as string).split(","); // ["C:\\Code\\deletemetest"];
const pictureExtensions = ["jpg", "png", "nef", "dng"];
const videoExtensions = ["mp4", "mov", "wmv", "avi", "mpg"];
const isVideoLengthExtracted = (process.env.VIDEO_ENABLED ?? "true") === "true";
const isExifExtracted = (process.env.EXIF_ENABLED ?? "true") === "true";
const paramCsvWriter: ObjectCsvWriterParams = {
    path: "out.csv",
    header: [
        { id: "year", title: "year" },
        { id: "jpg", title: "jpg (count)" },
        { id: "raw", title: "raw (count)" },
        { id: "video", title: "video (count)" },
        { id: "picturesize", title: "picture size (byte)" },
        { id: "videosize", title: "video size (byte)" },
        { id: "videolength", title: "video length (ms)" },
    ],
};
const paramCsvWriter2: ObjectCsvWriterParams = {
    path: "out2.csv",
    header: [
        { id: "device", title: "Device" },
        { id: "count", title: "jpg (count)" },
    ],
};
const csvWriter = createObjectCsvWriter(paramCsvWriter);
const csvWriter2 = createObjectCsvWriter(paramCsvWriter2);

interface CSVResult {
    year: number;
    jpg: number;
    raw: number;
    video: number;
    picturesize: number;
    videosize: number;
    videolength: number;
}

const result: Result = {
    year: {},
    pictureCount: 0,
    videoCount: 0,
    pictureModified: 0,
    pictureSize: 0,
    videoSize: 0,
    videoDuration: 0,
    source: {},
};
let finalCount = 0;
interface FeedbackFunction {
    (root: string, result: Result, err: Error | null, results?: MediaFile[]): void;
}

interface MediaFile {
    fullPath: string;
    sizeInByte: number;
    extension: string;
    durationLength: number;
    source: string;
}
interface TaskQueueExifPayload {
    file: string;
}
interface TaskQueueExifCallback {
    source: string;
}

interface TaskQueueVideoCallback {
    duration: number;
}
let queueAsyncExif = async.queue<TaskQueueExifPayload, TaskQueueExifCallback, Error>(function(task, callback) {
    const file = task.file;
    new ExifImage({ image: file }, function(error, exifData) {
        if (error) {
            console.error("Error: " + error.message + ", " + error.stack);
        }
        callback(error, {
            source: error ? "errorreadingexif" : exifData.image?.Make + " " + exifData.image?.Model,
        });
    });
}, 1000);

let queueAsyncVideo = async.queue<TaskQueueExifPayload, TaskQueueVideoCallback, Error>(function(task, callback) {
    const file = task.file;

    let duration1 = 0;
    let error: Error | undefined;
    getVideoDurationInSeconds(file)
        .then((duration: number) => {
            duration1 = duration;
        })
        .catch(err => {
            console.error(`Cannot get size of ${file} because of ${err}`);
            error = err;
        })
        .finally(() => {
            callback(error, {
                duration: error ? 0 : duration1,
            });
        });
}, 500);

function walk(dir: string, result: Result, done: FeedbackFunction) {
    let results: MediaFile[] = [];

    fs.readdir(dir, function(err, list) {
        if (err) {
            return done(dir, result, err);
        }
        var pending = list.length;
        if (!pending) {
            return done(dir, result, null, results);
        }
        list.forEach(function(file) {
            file = path.resolve(dir, file);
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    walk(file, result, function(root, result, err, res) {
                        if (res !== undefined) {
                            results = results.concat(res);
                        }
                        if (!--pending) {
                            done(dir, result, null, results);
                        }
                    });
                } else {
                    const ext = extractExtension(file);
                    if (isVideoLengthExtracted && videoExtensions.includes(ext)) {
                        let duration1 = 0;
                        queueAsyncVideo.push<TaskQueueVideoCallback>({ file }, (err, callbackResult) => {
                            results.push({
                                extension: extractExtension(file),
                                fullPath: file,
                                sizeInByte: stat.size,
                                durationLength: callbackResult === undefined ? 0 : callbackResult.duration,
                                source: "unknown",
                            });
                            if (!--pending) {
                                done(dir, result, null, results);
                            }
                        });
                    } else {
                        if (isExifExtracted && ext === "jpg") {
                            try {
                                queueAsyncExif.push<TaskQueueExifCallback>(
                                    {
                                        file: file,
                                    },
                                    (err, resultcallback) => {
                                        results.push({
                                            extension: extractExtension(file),
                                            fullPath: file,
                                            sizeInByte: stat.size,
                                            durationLength: 0,
                                            source: resultcallback === undefined ? "unknown jpg" : resultcallback.source,
                                        });
                                        if (!--pending) {
                                            done(dir, result, null, results);
                                        }
                                    }
                                );
                            } catch (error) {
                                console.log("Error: " + error.message);
                                if (!--pending) {
                                    done(dir, result, null, results);
                                }
                            }
                        } else {
                            results.push({
                                extension: extractExtension(file),
                                fullPath: file,
                                sizeInByte: stat.size,
                                durationLength: 0,
                                source: "unknown raw",
                            });
                            if (!--pending) {
                                done(dir, result, null, results);
                            }
                        }
                    }
                }
            });
        });
    });
}

interface Result {
    year: { [year: string]: YearlyResult };
    pictureCount: number;
    videoCount: number;
    pictureModified: number;
    pictureSize: number;
    source: { [id: string]: number };
    videoSize: number;
    videoDuration: number;
}
interface YearlyResult {
    year: number;
    typesCount: { [ext: string]: number };
    modifiedCount: number;
    pictureSize: number;
    videoSize: number;
    videoDuration: number;
}

function extractYear(root: string, filePath: string): number {
    const regex = /(\b)\\([0-9]{4})\\?(\b)/g;
    const groups = regex.exec(filePath);
    if (groups !== null) {
        const yearStr = groups[2];
        const yearNumber = Number(yearStr);
        return yearNumber;
    }
    return NaN;
}
function extractExtension(filePath: string): string {
    const extension = path.extname(filePath).substring(1);
    return extension.toLocaleLowerCase();
}
function extractIsMofidied(filePath: string): boolean {
    const splitted = filePath.split(path.sep);
    const fileName = splitted[splitted.length - 1];
    return fileName.substring(0, 1) === "_";
}
function display(result: Result): void {
    const dataCSV: CSVResult[] = [];
    const listYearsData: YearlyResult[] = [];
    const listModelMakeData: ObjectMap<{ device: string; count: number }>[] = [];
    Object.entries(result.source).forEach(([name, countDevice]) => {
        listModelMakeData.push({ device: name, count: countDevice } as any);
    });
    Object.entries(result.year).forEach(([key, yearValue]) => {
        listYearsData.push(yearValue);
    });
    listYearsData
        .sort(d => d.year)
        .forEach(yearValue => {
            let total = 0;
            console.log("------------------------------------------------------------");
            console.log(`Year ${yearValue.year}`);
            Object.entries(yearValue.typesCount).forEach(([typeKey, typeCount]) => {
                total += typeCount;
                console.log(`\t${typeKey}: ${typeCount}`);
            });
            console.log(`Image/video: ${total}`);
            console.log(`Modified: ${yearValue.modifiedCount}`);
            console.log(`Picture size: ${prettyBytes(yearValue.pictureSize)}`);
            console.log(`Video size: ${prettyBytes(yearValue.videoSize)}`);
            console.log(`Video duration: ${prettyMilliseconds(yearValue.videoDuration * 1000)}`);
            dataCSV.push({
                year: yearValue.year,
                jpg: yearValue.typesCount["jpg"] ?? 0,
                raw: yearValue.typesCount["nef"] ?? 0,
                video:
                    (yearValue.typesCount["mp4"] ?? 0) +
                    (yearValue.typesCount["mov"] ?? 0) +
                    (yearValue.typesCount["wmv"] ?? 0) +
                    (yearValue.typesCount["avi"] ?? 0) +
                    (yearValue.typesCount["mpg"] ?? 0),
                picturesize: yearValue.pictureSize,
                videosize: yearValue.videoSize,
                videolength: yearValue.videoDuration * 1000,
            });
        });
    Object.entries(listModelMakeData).forEach(([index, data]) => {
        console.log(`Device ${data.device}: ${data.count}`);
    });

    console.log("------------------------------------------------------------");
    console.log(`Total pictures: ${result.pictureCount}`);
    console.log(`Total videos: ${result.videoCount}`);
    console.log(`Total modified pictures: ${result.pictureModified}`);
    console.log(`Total picture size: ${prettyBytes(result.pictureSize)}`);
    console.log(`Total video size: ${prettyBytes(result.videoSize)}`);
    console.log(`Total video duration: ${prettyMilliseconds(result.videoDuration * 1000)}`);
    csvWriter
        .writeRecords(dataCSV)
        .then(() => console.log("The CSV file with count, bytes and time was written successfully"));
    csvWriter2
        .writeRecords(listModelMakeData)
        .then(() => console.log("The CSV for devices file was written successfully"));
}
const finalResult: FeedbackFunction = (root: string, result: Result, err: Error | null, results?: MediaFile[]) => {
    if (err != null) {
        throw err;
    }
    if (results !== undefined) {
        results.forEach((media: MediaFile) => {
            const year = extractYear(root, media.fullPath);
            if (!isNaN(year)) {
                const extension = media.extension;
                const modified = extractIsMofidied(media.fullPath);
                if (result.year[year] === undefined) {
                    result.year[year] = {
                        year: year,
                        typesCount: {},
                        modifiedCount: 0,
                        pictureSize: 0,
                        videoDuration: 0,
                        videoSize: 0,
                    };
                }
                const isPicture = pictureExtensions.includes(extension.toLocaleLowerCase());
                const isVideo = videoExtensions.includes(extension.toLocaleLowerCase());
                if (isPicture || isVideo) {
                    if (modified) {
                        result.year[year].modifiedCount += 1;
                        result.pictureModified += 1;
                    }
                    if (result.year[year].typesCount[extension] === undefined) {
                        result.year[year].typesCount[extension] = 1;
                    } else {
                        5;
                        result.year[year].typesCount[extension] += 1;
                    }
                    if (isPicture) {
                        result.pictureCount += 1;
                        result.year[year].pictureSize += media.sizeInByte;
                        result.pictureSize += media.sizeInByte;
                        if (result.source[media.source] === undefined) {
                            result.source[media.source] = 1;
                        } else {
                            result.source[media.source]++;
                        }
                    }
                    if (isVideo) {
                        result.videoCount += 1;
                        result.year[year].videoSize += media.sizeInByte;
                        result.videoSize += media.sizeInByte;
                        result.year[year].videoDuration += media.durationLength;
                        result.videoDuration += media.durationLength;
                    }
                }
            } else {
                console.error(`Error extracting year for : ${media.fullPath}`);
            }
        });
    }
    finalCount++;
    if (finalCount == directoryRoot.length) {
        display(result);
        const end = process.hrtime(startTime);
        console.log(`Executed in ${prettyMilliseconds(end[0] * 1000)} `);
    }
};

const startTime = process.hrtime();
directoryRoot.forEach((root: string, index: number) => {
    console.log(`Analyzing ${root} folder`);
    walk(root, result, finalResult);
});
