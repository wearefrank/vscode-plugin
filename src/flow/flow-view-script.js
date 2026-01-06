const svg = container.querySelector("svg");

function fitSvg() {
    if (!svg) return;

    const bbox = svg.getBBox();
    if (!bbox.width || !bbox.height) return;

    const PADDING = 10;

    svg.setAttribute(
        "viewBox",
        `${bbox.x - PADDING} ${bbox.y - PADDING} ${bbox.width + PADDING * 2} ${bbox.height + PADDING * 2}`
    );

    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

let panZoom;

window.addEventListener("load", () => {
    fitSvg();
    panZoom = svgPanZoom(svg, {
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: true,
        center: true,
        minZoom: 0.1,
        maxZoom: 20,
        zoomScaleSensitivity: 0.3,
        panEnabled: true
    });

    document.getElementById("zoom-in").onclick = () => panZoom.zoomIn();
    document.getElementById("zoom-out").onclick = () => panZoom.zoomOut();
    document.getElementById("reset").onclick = () => {
        panZoom.resetZoom();
        panZoom.center();
    };
});

window.addEventListener("resize", () => {
    panZoom.resize();
    panZoom.fit();
    panZoom.center();
});
