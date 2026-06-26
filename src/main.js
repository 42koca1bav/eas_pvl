import {
    Cartesian3,
    Math as CesiumMath,
    Terrain,
    Viewer,
    Cesium3DTileset,
    Ion,
    CustomDataSource,
    ClassificationType,
    Color,
    JulianDate,
    ClockRange,
    HeightReference,
    SampledPositionProperty,
    TimeIntervalCollection,
    TimeInterval,
    VelocityOrientationProperty

} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YzFhMTE4OC1mNzk5LTQzNmUtYmFiZS01ZTE4MWUyMGViMmIiLCJpZCI6NDQzMjM5LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODExODcxMzZ9.CHvYAKAeCDVSqVGYfpe91RHwvh8-9l1hDi04hWZwt1A";

// Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
const viewer = new Viewer("cesiumContainer", {
    terrain: Terrain.fromWorldTerrain(),
    shouldAnimate: true
});

// load 3D-Gebäudetileset from Cesium-Assets
const tileset = await Cesium3DTileset.fromIonAssetId(4957647);
viewer.scene.primitives.add(tileset);

// -- Generate and draw the path --
// load Zack-Path from OSM databse
const overpassQuery = `[out:json];rel(935322);way(r);out geom;`;
const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

const response = await fetch(url);
const data = await response.json();

const zackeDataSource = new CustomDataSource("Zacke Accurate Path");
viewer.dataSources.add(zackeDataSource);

// Filter out just the ways with geometry
const ways = data.elements.filter(w => w.type === "way" && w.geometry);
const chainedGeometry = [];

if (ways.length > 0) {
    // Start with the first way we get
    let currentWay = ways.shift();
    chainedGeometry.push(...currentWay.geometry);

    // Keep finding connecting segments until we run out
    while (ways.length > 0) {
        const firstNode = chainedGeometry[0];
        const lastNode = chainedGeometry[chainedGeometry.length - 1];

        let connectedAtEnd = false;
        let connectedAtStart = false;

        // Try to attach a track segment to the END of our chain
        for (let i = 0; i < ways.length; i++) {
            const w = ways[i];
            const wFirst = w.geometry[0];
            const wLast = w.geometry[w.geometry.length - 1];

            if (wFirst.lon === lastNode.lon && wFirst.lat === lastNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.push(...nextWay.geometry.slice(1));
                connectedAtEnd = true;
                break;
            } else if (wLast.lon === lastNode.lon && wLast.lat === lastNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.push(...nextWay.geometry.slice().reverse().slice(1));
                connectedAtEnd = true;
                break;
            }
        }

        if (connectedAtEnd) continue;

        // Try to attach a track segment to the START of our chain
        for (let i = 0; i < ways.length; i++) {
            const w = ways[i];
            const wFirst = w.geometry[0];
            const wLast = w.geometry[w.geometry.length - 1];

            if (wLast.lon === firstNode.lon && wLast.lat === firstNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.unshift(...nextWay.geometry.slice(0, -1));
                connectedAtStart = true;
                break;
            } else if (wFirst.lon === firstNode.lon && wFirst.lat === firstNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.unshift(...nextWay.geometry.slice().reverse().slice(0, -1));
                connectedAtStart = true;
                break;
            }
        }

        // If we couldn't attach anything to the front or back, break the loop.
        // This neatly ignores disconnected passing loops or depot sidings!
        if (!connectedAtEnd && !connectedAtStart) break;
    }
}

// Convert the stitched nodes into Cesium Cartesians
const pathPositions = [];
chainedGeometry.forEach(node => {
    pathPositions.push(Cartesian3.fromDegrees(node.lon, node.lat));
});

// draw the main, continuous track
zackeDataSource.entities.add({
    polyline: {
        positions: pathPositions,
        width: 4,
        clampToGround: true,
        classificationType: ClassificationType.BOTH,
        material: new Color(200 / 255, 100 / 255, 50 / 255, 1.0)
    }
});

// -- Animation setup --
// setup for animation
const start = JulianDate.fromDate(new Date(2026, 5, 18, 12, 0, 0));
let time = start;
const positionProperty = new SampledPositionProperty();
const speed = 5.0; // m/s

// Forward path
for (let i = 0; i < pathPositions.length; i++) {
    const currentPosition = pathPositions[i];

    if (i > 0) {
        const prevPosition = pathPositions[i - 1];
        const distance = Cartesian3.distance(prevPosition, currentPosition);
        const secondsToTravel = distance / speed;
        time = JulianDate.addSeconds(time, secondsToTravel, new JulianDate());
    }

    positionProperty.addSample(time, currentPosition);
}

// Pause at the top for 5 seconds
const topPosition = pathPositions[pathPositions.length - 1];
const pauseEnd = JulianDate.addSeconds(time, 5.0, new JulianDate());
positionProperty.addSample(pauseEnd, topPosition);
time = pauseEnd.clone();

// Reverse path (going back down)
for (let i = pathPositions.length - 2; i >= 0; i--) {
    const currentPosition = pathPositions[i];
    const nextPosition = pathPositions[i + 1];
    const distance = Cartesian3.distance(currentPosition, nextPosition);
    const secondsToTravel = distance / speed;
    time = JulianDate.addSeconds(time, secondsToTravel, new JulianDate());
    positionProperty.addSample(time, currentPosition);
}

const finalStop = time;

// convert path data into an animation
viewer.clock.startTime = start.clone();
viewer.clock.stopTime = finalStop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = ClockRange.CLAMPED;
viewer.clock.multiplier = 3;
viewer.timeline.zoomTo(start, finalStop);


// add a train which position and orientation is dependent from the previously defined animation
const trainEntity = viewer.entities.add({
    availability: new TimeIntervalCollection([
        new TimeInterval({ start: start, stop: finalStop })
    ]),
    position: positionProperty,
    orientation: new VelocityOrientationProperty(positionProperty),
    box: {
        dimensions: new Cartesian3(14.0, 2.6, 3.5),
        material: Color.GOLD,
        heightReference: HeightReference.CLAMP_TO_GROUND
    }
});

// -- same for a second train but inverted --
// Create second train (opposite direction)
const positionProperty2 = new SampledPositionProperty();
let time2 = start;

// Start at the top
positionProperty2.addSample(time2, pathPositions[pathPositions.length - 1]);

// Go down (reverse path)
for (let i = pathPositions.length - 2; i >= 0; i--) {
    const currentPosition = pathPositions[i];
    const nextPosition = pathPositions[i + 1];
    const distance = Cartesian3.distance(currentPosition, nextPosition);
    const secondsToTravel = distance / speed;
    time2 = JulianDate.addSeconds(time2, secondsToTravel, new JulianDate());
    positionProperty2.addSample(time2, currentPosition);
}

// Pause at the bottom for 5 seconds
const pauseEnd2 = JulianDate.addSeconds(time2, 5.0, new JulianDate());
positionProperty2.addSample(pathPositions[0], pauseEnd2);
time2 = pauseEnd2.clone();

// Go up (forward path)
for (let i = 1; i < pathPositions.length; i++) {
    const currentPosition = pathPositions[i];
    const prevPosition = pathPositions[i - 1];
    const distance = Cartesian3.distance(prevPosition, currentPosition);
    const secondsToTravel = distance / speed;
    time2 = JulianDate.addSeconds(time2, secondsToTravel, new JulianDate());
    positionProperty2.addSample(time2, currentPosition);
}

const train2Entity = viewer.entities.add({
    availability: new TimeIntervalCollection([
        new TimeInterval({ start: start, stop: finalStop })
    ]),
    position: positionProperty2,
    orientation: new VelocityOrientationProperty(positionProperty2),
    box: {
        dimensions: new Cartesian3(14.0, 2.6, 3.5),
        material: Color.GOLD,
        heightReference: HeightReference.CLAMP_TO_GROUND
    }
});

// move camera to posistion above Marienplatz and looking up the hill
viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(9.168252, 48.764144, 400.0),
    orientation: {
        heading: CesiumMath.toRadians(170.0),
        pitch: CesiumMath.toRadians(-10.0),
        roll: 0.0,
    },
});
