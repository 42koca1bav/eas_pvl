/*
 * Code für die Ausführung in CesiumJS Sandcastle online Editor:
 */

// Zugriff auf Cesium Ion assets
Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YzFhMTE4OC1mNzk5LTQzNmUtYmFiZS01ZTE4MWUyMGViMmIiLCJpZCI6NDQzMjM5LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODExODcxMzZ9.CHvYAKAeCDVSqVGYfpe91RHwvh8-9l1hDi04hWZwt1A";

try {
    // lade Cesium World terrain und erlaube animationen
    const viewer = new Cesium.Viewer("cesiumContainer", {
        terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),
        shouldAnimate: true
    });

    // lade 3D-Gebäudetileset aus den Cesium-Assets
    const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(4957647);
    viewer.scene.primitives.add(tileset);

    const extras = tileset.asset.extras;
    if (
        Cesium.defined(extras) &&
        Cesium.defined(extras.ion) &&
        Cesium.defined(extras.ion.defaultStyle)
    ) {
        tileset.style = new Cesium.Cesium3DTileStyle(extras.ion.defaultStyle);
    }

    // lade den Pfad der Zacke aus der OSM Datenbank
    const overpassQuery = `[out:json];rel(935322);way(r);out geom;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    const response = await fetch(url);
    const data = await response.json();

    const zackeDataSource = new Cesium.CustomDataSource("Zacke Accurate Path");
    viewer.dataSources.add(zackeDataSource);

    // --- THE TRACK STITCHER ---
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

    // Convert the perfectly stitched nodes into Cesium Cartesians
    const pathPositions = [];
    chainedGeometry.forEach(node => {
        pathPositions.push(Cesium.Cartesian3.fromDegrees(node.lon, node.lat));
    });

    // Draw the main, continuous track
    zackeDataSource.entities.add({
        polyline: {
            positions: pathPositions,
            width: 4,
            clampToGround: true,
            classificationType: Cesium.ClassificationType.BOTH,
            material: new Cesium.Color(200 / 255, 100 / 255, 50 / 255, 1.0)
        }
    });

    // --- ANIMATION SETUP ---
    const start = Cesium.JulianDate.fromDate(new Date(2026, 5, 18, 12, 0, 0));
    let time = start;
    const positionProperty = new Cesium.SampledPositionProperty();
    const speed = 5.0; // m/s

    for (let i = 0; i < pathPositions.length; i++) {
        const currentPosition = pathPositions[i];

        if (i > 0) {
            const prevPosition = pathPositions[i - 1];
            const distance = Cesium.Cartesian3.distance(prevPosition, currentPosition);
            const secondsToTravel = distance / speed;
            time = Cesium.JulianDate.addSeconds(time, secondsToTravel, new Cesium.JulianDate());
        }

        positionProperty.addSample(time, currentPosition);
    }

    const stop = time;

    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    // CLAMPED prevents the train from instantly teleporting back to the start
    viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
    viewer.clock.multiplier = 3;
    viewer.timeline.zoomTo(start, stop);

    const trainEntity = viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([
            new Cesium.TimeInterval({ start: start, stop: stop })
        ]),
        position: positionProperty,
        orientation: new Cesium.VelocityOrientationProperty(positionProperty),
        box: {
            dimensions: new Cesium.Cartesian3(14.0, 2.6, 3.5),
            material: Cesium.Color.GOLD,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
    });

    await viewer.zoomTo(trainEntity);

} catch (error) {
    console.log(error);
}