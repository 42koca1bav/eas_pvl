 # Der Pfad der Zacke: Visualisierung des Strecken- und Höhenverlaufs der Zahnradbahn in Stuttgart
_Entwicklung einer Cesium-basierten 3D-Webkarten-Anwendung
mit Vite als Prüfungsvorleistung im Modul Datenbeschaffung und -visualisierung_


![Screenshot](https://github.com/42koca1bav/eas_pvl/blob/main/Screenshot%202026-06-26%20212208.png)

-----

__Inhaltsverzeichnis__
<!-- TOC -->
[1 - Wahl des Themas und der verwendeten Daten](#1---wahl-des-themas-und-der-verwendeten-daten)  
[2 - Laden der Daten](#2---laden-der-daten)  
[3 - Überarbeiten und Anzeigen der Pfaddaten](#3---überarbeiten-und-anzeigen-der-pfaddaten)  
[4 - Animation der Zacke](#4---animation-der-zacke)  
[5 - Kamera auf die richtige Position setzen](#5---kamera-auf-die-richtige-position-setzen)  
<!-- /TOC -->

-----

## 1 - Wahl des Themas und der verwendeten Daten

Nach Sichtung der auf https://opengeodata.lgl-bw.de/#/ verfügbaren Datensätze wurde sich entschieden, eine Echtzeit-Visualisierung des Fahrtverlaufs für die Zacke in Stuttgart zu erstellen. Da immer maximal zwei Züge der Zahnradbahn gleichzeitig die Strecke vom Marienplatz zum Bahnhof in Degerloch fahren und die Fahrt nur wenige Minuten dauert, wurde dies als kleines, anschauliches Projekt gewählt.

Dafür wurden folgende die Gebäudemodellsätze mit LoD2 heruntergeladen, welchen um den Streckenverlauf der Zacke liegen: 
- LoD2_32_512_5399_1_BW.gml
- LoD2_32_512_5400_1_BW.gml
- LoD2_32_512_5401_1_BW.gml  

Für den Pfad der Zacke liegt ein OSM Datensatz unter der Referenznummer 935322 vor.

Bevor der fertige Code in ein Vite-Project geladen wird, wird zum einfacheren Testen zunächst mit dem Cesium Sandcastle Editor gearbeitet. Dort wurde auch bestimmt welche initiale Kamerapostion gut aussehen würde.


## 2 - Laden der Daten

Um den Pfand der Zacke ansprechend zu visualisieren laden wir zunächst das Terrain, Modelle der umliegenden Gebäude und die rohen Pfaddaten der Zacke in CeasiumJS.

```js
// Zugriff auf Cesium Ion assets
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YzFhMTE4OC1mNzk5LTQzNmUtYmFiZS01ZTE4MWUyMGViMmIiLCJpZCI6NDQzMjM5LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODExODcxMzZ9.CHvYAKAeCDVSqVGYfpe91RHwvh8-9l1hDi04hWZwt1A";


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
```

## 3 - Überarbeiten und Anzeigen der Pfaddaten

Der OSM Datensatz zur Zacke enthält zusätzlich Informationen zu den einzelnen Haltestellen und die einzelnen Abschnitte sind nicht als eine durchgehende Strecke definiert. Dh. die Daten müssen bereinigt und in die richtige Reihenfolge gebracht werden.

```js
// filtere nur Elemente mit Geometrie heraus
const ways = data.elements.filter(w => w.type === "way" && w.geometry);
const chainedGeometry = [];

if (ways.length > 0) {
    
    // füge den ersten gefundenen Pfad zur Liste hinzu
    let currentWay = ways.shift();
    chainedGeometry.push(...currentWay.geometry);

    // füge anschließende Abschnitte hinzu bis keine mehr gefunden werden können
    while (ways.length > 0) {
        const firstNode = chainedGeometry[0];
        const lastNode = chainedGeometry[chainedGeometry.length - 1];

        let connectedAtEnd = false;
        let connectedAtStart = false;

        // versuche den gefundenen Abschnitt ans Ende des Pfades anzufügen
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

        // versuche den gefundenen Abschnitt an den Anfang des Pfades anzufügen
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

        // Wenn der gefundene Pfad weder am Anfang noch Ende angefügt werden kann, ist es eine Haltestelle oder ähnliches, also beenden wir den loop
        if (!connectedAtEnd && !connectedAtStart) break;
    }
}

// convertiere den zusammengesetzten Pfad in Cesium Nodes
const pathPositions = [];
chainedGeometry.forEach(node => {
    pathPositions.push(Cesium.Cartesian3.fromDegrees(node.lon, node.lat));
});

// zeichne den Pfad als orange Linie den Berg hinauf
zackeDataSource.entities.add({
    polyline: {
        positions: pathPositions,
        width: 4,
        clampToGround: true,
        classificationType: Cesium.ClassificationType.BOTH,
        material: new Cesium.Color(200 / 255, 100 / 255, 50 / 255, 1.0)
    }
});
```

## 4 - Animation der Zacke
Für die Visualisierung wird aus den Pfaddaten eine Animation generiert

```js
// Setup für die Animation
const start = JulianDate.fromDate(new Date(2026, 5, 18, 12, 0, 0));
let time = start;
const positionProperty = new SampledPositionProperty();
const speed = 5.0; // m/s

// Extrahiere für jede Pfadposition eine Animationspostion in Abhägigkeit von der Zeit und der gewählten Geschwindigkeit. Zunächst für die Fahrt bergauf.
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

// 5 sekunden pause oben
const topPosition = pathPositions[pathPositions.length - 1];
const pauseEnd = JulianDate.addSeconds(time, 5.0, new JulianDate());
positionProperty.addSample(pauseEnd, topPosition);
time = pauseEnd.clone();

// Pfad bergab
for (let i = pathPositions.length - 2; i >= 0; i--) {
    const currentPosition = pathPositions[i];
    const nextPosition = pathPositions[i + 1];
    const distance = Cartesian3.distance(currentPosition, nextPosition);
    const secondsToTravel = distance / speed;
    time = JulianDate.addSeconds(time, secondsToTravel, new JulianDate());
    positionProperty.addSample(time, currentPosition);
}

const finalStop = time;

// Set up der Animation  im Viewer
viewer.clock.startTime = start.clone();
viewer.clock.stopTime = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = ClockRange.CLAMPED; // prevents the train from instantly teleporting back to the start
viewer.clock.multiplier = 3;
viewer.timeline.zoomTo(start, finalStop);

// Füge einen Zug als goldene Box hinzu, dessen Position und Orientierung aus der Animation abgeleitet sind
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
```

## 5 - Kamera auf die richtige Position setzen
Damit wir die Fahrt der Zacke schön betrachten können, wird die Kamera über dem Marienplatz mit Blickrichtung Bergauf positioniert.
```js
viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(9.168252, 48.764144, 400.0),
    orientation: {
        heading: CesiumMath.toRadians(170.0),
        pitch: CesiumMath.toRadians(-10.0),
        roll: 0.0,
    },
});
```
