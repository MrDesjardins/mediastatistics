import * as g from "glob";
import * as path from "path";
import * as fs from "fs";
import { getVideoDurationInSeconds } from "get-video-duration";
import prettyBytes from "pretty-bytes";
import prettyMilliseconds from "pretty-ms";
// const directoryRoot = ["F:\\images\\Patrick_Melodie"];
// const directoryRoot = ["C:\\Code\\deletemetest"];
const directoryRoot = ["F:\\images\\Patrick_Melodie", "F:\\images\\_GooglePhotos", "F:\\footages"];
const pictureExtensions = ["jpg", "png", "nef", "dng"];
const videoExtensions = ["mp4", "mov", "wmv", "avi", "mpg"];

const result: Result = {
    year: {},
    pictureCount: 0,
    videoCount: 0,
    pictureModified: 0,
    pictureSize: 0,
    videoSize: 0,
    videoDuration: 0,
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
}
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
                    if (videoExtensions.includes(ext)) {
                        let duration1 = 0;
                        getVideoDurationInSeconds(file)
                            .then((duration: number) => {
                                duration1 = duration;
                            })
                            .catch(err => {
                                console.error(`Cannot get size of ${file} because of ${err}`);
                            })
                            .finally(() => {
                                results.push({
                                    extension: extractExtension(file),
                                    fullPath: file,
                                    sizeInByte: stat.size,
                                    durationLength: duration1,
                                });
                                if (!--pending) {
                                    done(dir, result, null, results);
                                }
                            });
                    } else {
                        results.push({
                            extension: extractExtension(file),
                            fullPath: file,
                            sizeInByte: stat.size,
                            durationLength: 0,
                        });
                        if (!--pending) {
                            done(dir, result, null, results);
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
    const rootLength = root.length;
    const removedRoot = filePath.substring(rootLength);
    const yearStr = removedRoot.split(path.sep)[1];
    const yearNumber = Number(yearStr);
    return yearNumber;
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
    const listYearsData: YearlyResult[] = [];
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
        });
    console.log("------------------------------------------------------------");
    console.log(`Total pictures: ${result.pictureCount}`);
    console.log(`Total videos: ${result.videoCount}`);
    console.log(`Total modified pictures: ${result.pictureModified}`);
    console.log(`Total picture size: ${prettyBytes(result.pictureSize)}`);
    console.log(`Total video size: ${prettyBytes(result.videoSize)}`);
    console.log(`Total video duration: ${prettyMilliseconds(result.videoDuration * 1000)}`);
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
                        pictureSize:0,
                        videoDuration:0,
                        videoSize:0
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
                    }
                    if (isVideo) {
                        result.videoCount += 1;
                        result.year[year].videoSize += media.sizeInByte;
                        result.videoSize += media.sizeInByte;
                        result.year[year].videoDuration += media.durationLength;
                        result.videoDuration += media.durationLength;
                    }
                }
            }
        });
    }
    finalCount++;
    if (finalCount == directoryRoot.length) {
        display(result);
        const end = process.hrtime(startTime);
        console.log(`Executed in ${end[0]} seconds`);
    }
};

const startTime = process.hrtime();
directoryRoot.forEach((root: string, index: number) => {
    walk(root, result, finalResult);
});
