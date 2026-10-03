import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import "./DrawSpace.css";

import { recognizeShape } from "../../recognition/recognizeShape";

const SNAP_RADIUS = 100;


/* =========================================================
 * Geometry helpers
 * ======================================================= */

function distance(a, b) {
    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );
}


function getShapeCenter(shape) {
    if (
        shape &&
        shape.center &&
        Number.isFinite(shape.center.x) &&
        Number.isFinite(shape.center.y)
    ) {
        return {
            x: shape.center.x,
            y: shape.center.y,
        };
    }

    if (
        shape &&
        shape.vertices &&
        shape.vertices.length > 0
    ) {
        return {
            x:
                shape.vertices.reduce(
                    (sum, point) =>
                        sum + point.x,
                    0
                ) / shape.vertices.length,

            y:
                shape.vertices.reduce(
                    (sum, point) =>
                        sum + point.y,
                    0
                ) / shape.vertices.length,
        };
    }

    return {
        x: 0,
        y: 0,
    };
}


function moveShape(
    shape,
    offsetX,
    offsetY
) {
    const moved = {
        ...shape,
    };

    if (shape.center) {
        moved.center = {
            x:
                shape.center.x +
                offsetX,

            y:
                shape.center.y +
                offsetY,
        };
    }

    if (
        shape.vertices &&
        shape.vertices.length > 0
    ) {
        moved.vertices =
            shape.vertices.map(
                vertex => ({
                    x:
                        vertex.x +
                        offsetX,

                    y:
                        vertex.y +
                        offsetY,
                })
            );
    }

    if (
        shape.innerVertices &&
        shape.innerVertices.length > 0
    ) {
        moved.innerVertices =
            shape.innerVertices.map(
                vertex => ({
                    x:
                        vertex.x +
                        offsetX,

                    y:
                        vertex.y +
                        offsetY,
                })
            );
    }

    return moved;
}


/* =========================================================
 * Square normalization
 * ======================================================= */

function createSquare(shape) {
    if (
        !shape.vertices ||
        shape.vertices.length !== 4
    ) {
        return null;
    }

    const vertices = shape.vertices;

    /*
     * Центр берём из диагоналей.
     *
     * Это устойчивее, чем просто среднее
     * координат слегка кривого рисунка.
     */
    const diagonalCenterA = {
        x:
            (
                vertices[0].x +
                vertices[2].x
            ) / 2,

        y:
            (
                vertices[0].y +
                vertices[2].y
            ) / 2,
    };

    const diagonalCenterB = {
        x:
            (
                vertices[1].x +
                vertices[3].x
            ) / 2,

        y:
            (
                vertices[1].y +
                vertices[3].y
            ) / 2,
    };

    const center = {
        x:
            (
                diagonalCenterA.x +
                diagonalCenterB.x
            ) / 2,

        y:
            (
                diagonalCenterA.y +
                diagonalCenterB.y
            ) / 2,
    };

    /*
     * Для квадрата достаточно длины диагонали.
     *
     * Используем обе диагонали и усредняем их,
     * чтобы небольшая кривизна рисунка не влияла
     * на итоговую форму.
     */
    const diagonalA =
        distance(
            vertices[0],
            vertices[2]
        );

    const diagonalB =
        distance(
            vertices[1],
            vertices[3]
        );

    const diagonal =
        (
            diagonalA +
            diagonalB
        ) / 2;

    if (!Number.isFinite(diagonal) || diagonal <= 0) {
        return null;
    }

    /*
     * Определяем ориентацию квадрата.
     *
     * Вектор от центра к вершине 0.
     *
     * Для идеального квадрата это направление
     * одной из его диагоналей.
     */
    const vx =
        vertices[0].x -
        center.x;

    const vy =
        vertices[0].y -
        center.y;

    const vectorLength =
        Math.hypot(vx, vy);

    if (vectorLength <= 0) {
        return null;
    }

    /*
     * Радиус описанной окружности квадрата —
     * половина диагонали.
     */
    const radius =
        diagonal / 2;

    /*
     * Сохраняем фактический угол диагонали.
     */
    const rotation =
        Math.atan2(vy, vx);

    const normalizedVertices = [];

    /*
     * Строим идеальный квадрат.
     *
     * Вершина 0 находится на rotation,
     * остальные через 90°.
     */
    for (let i = 0; i < 4; i++) {
        const angle =
            rotation +
            i *
                Math.PI /
                2;

        normalizedVertices.push({
            x:
                center.x +
                Math.cos(angle) *
                radius,

            y:
                center.y +
                Math.sin(angle) *
                radius,
        });
    }

    return {
        ...shape,
        type: "square",
        center,
        vertices:
            normalizedVertices,
    };
}


/* =========================================================
 * Rhombus normalization
 * ======================================================= */

function createRhombus(shape) {
    if (
        !shape.vertices ||
        shape.vertices.length !== 4
    ) {
        return null;
    }

    const vertices = shape.vertices;

    /*
     * Диагонали:
     *
     * 0 <-> 2
     * 1 <-> 3
     */
    const diagonalA =
        distance(
            vertices[0],
            vertices[2]
        );

    const diagonalB =
        distance(
            vertices[1],
            vertices[3]
        );

    if (
        !Number.isFinite(diagonalA) ||
        !Number.isFinite(diagonalB) ||
        diagonalA <= 0 ||
        diagonalB <= 0
    ) {
        return null;
    }

    /*
     * Центр ромба — пересечение диагоналей.
     */
    const center = {
        x:
            (
                vertices[0].x +
                vertices[2].x
            ) / 2,

        y:
            (
                vertices[0].y +
                vertices[2].y
            ) / 2,
    };

    /*
     * Определяем, какая диагональ длиннее.
     *
     * Это ВАЖНО:
     * длинная диагональ не обязана быть вертикальной.
     */
    const diagonalAIsLong =
        diagonalA >= diagonalB;

    const longDiagonal =
        diagonalAIsLong
            ? diagonalA
            : diagonalB;

    const shortDiagonal =
        diagonalAIsLong
            ? diagonalB
            : diagonalA;

    /*
     * ВАЖНОЕ ПРАВИЛО:
     *
     * одна диагональ всегда вертикальна,
     * другая всегда горизонтальна.
     *
     * Но длинная диагональ сохраняет свою длину.
     *
     * Поэтому возможны:
     *
     *       /\
     *      /  \
     *      \  /
     *       \/
     *
     * где длинная диагональ вертикальна
     *
     * И:
     *
     *       <>
     *
     * где длинная диагональ горизонтальна.
     *
     * Мы определяем, какую диагональ сделать
     * вертикальной, по исходной ориентации.
     *
     * Это позволяет не ломать смысл "вертикального ромба":
     * вертикальной становится одна из диагоналей,
     * а не обязательно длинная.
     */
    const angleA =
        Math.atan2(
            vertices[2].y -
                vertices[0].y,

            vertices[2].x -
                vertices[0].x
        );

    const angleB =
        Math.atan2(
            vertices[3].y -
                vertices[1].y,

            vertices[3].x -
                vertices[1].x
        );

    /*
     * Насколько каждая диагональ близка
     * к вертикальному направлению.
     */
    const verticalityA =
        Math.abs(
            Math.sin(angleA)
        );

    const verticalityB =
        Math.abs(
            Math.sin(angleB)
        );

    const diagonalAVertical =
        verticalityA >= verticalityB;

    const verticalDiagonal =
        diagonalAVertical
            ? diagonalA
            : diagonalB;

    const horizontalDiagonal =
        diagonalAVertical
            ? diagonalB
            : diagonalA;

    const verticalRadius =
        verticalDiagonal / 2;

    const horizontalRadius =
        horizontalDiagonal / 2;

    /*
     * Идеальный ромб:
     *
     *             top
     *              *
     *              |
     *              |
     * left *-------+-------* right
     *              |
     *              |
     *              *
     *            bottom
     *
     * Длины диагоналей полностью сохраняются.
     */
    const normalizedVertices = [
        {
            x: center.x,
            y:
                center.y -
                verticalRadius,
        },

        {
            x:
                center.x +
                horizontalRadius,
            y: center.y,
        },

        {
            x: center.x,
            y:
                center.y +
                verticalRadius,
        },

        {
            x:
                center.x -
                horizontalRadius,
            y: center.y,
        },
    ];

    return {
        ...shape,
        type: "rhombus",
        center,
        vertices:
            normalizedVertices,

        /*
         * Эта информация может пригодиться
         * в дальнейшем для отображения/логики.
         */
        longDiagonal:
            longDiagonal,

        longDiagonalOrientation:
            longDiagonal ===
            verticalDiagonal
                ? "vertical"
                : "horizontal",
    };
}


/* =========================================================
 * Triangle normalization
 * ======================================================= */

function createTriangle(shape) {
    if (
        !shape.vertices ||
        shape.vertices.length !== 3
    ) {
        return null;
    }

    const center =
        getShapeCenter(shape);

    let direction =
        shape.direction || "up";

    const sideLength =
        averageDistance(
            shape.vertices
        );

    /*
     * Для равностороннего треугольника:
     *
     * circumradius = side / sqrt(3)
     */
    const radius =
        sideLength /
        Math.sqrt(3);

    let rotation;

    switch (direction) {
        case "right":
            rotation = 0;
            break;

        case "down":
            rotation =
                Math.PI / 2;
            break;

        case "left":
            rotation =
                Math.PI;
            break;

        case "up":
        default:
            rotation =
                -Math.PI / 2;
            break;
    }

    const normalizedVertices = [];

    for (let i = 0; i < 3; i++) {
        const angle =
            rotation +
            i *
                Math.PI *
                2 /
                3;

        normalizedVertices.push({
            x:
                center.x +
                Math.cos(angle) *
                radius,

            y:
                center.y +
                Math.sin(angle) *
                radius,
        });
    }

    return {
        ...shape,
        type: "triangle",
        center,
        direction,
        vertices:
            normalizedVertices,
    };
}


function averageDistance(vertices) {
    if (
        !vertices ||
        vertices.length < 2
    ) {
        return 0;
    }

    let total = 0;
    let count = 0;

    for (
        let i = 0;
        i < vertices.length;
        i++
    ) {
        for (
            let j = i + 1;
            j < vertices.length;
            j++
        ) {
            total +=
                distance(
                    vertices[i],
                    vertices[j]
                );

            count++;
        }
    }

    return count > 0
        ? total / count
        : 0;
}


/* =========================================================
 * Star normalization
 * ======================================================= */

function createStar(shape) {
    const center =
        shape.center || {
            x: 0,
            y: 0,
        };

    let radius =
        Number(shape.radius);

    if (
        !Number.isFinite(radius) ||
        radius <= 0
    ) {
        if (
            shape.vertices &&
            shape.vertices.length > 0
        ) {
            radius =
                average(
                    shape.vertices.map(
                        vertex =>
                            distance(
                                vertex,
                                center
                            )
                    )
                );
        }
    }

    if (
        !Number.isFinite(radius) ||
        radius <= 0
    ) {
        radius = 50;
    }

    const rotation =
        shape.direction === "down"
            ? Math.PI / 2
            : -Math.PI / 2;

    const outerVertices = [];

    for (let i = 0; i < 5; i++) {
        const angle =
            rotation +
            i *
                Math.PI *
                2 /
                5;

        outerVertices.push({
            x:
                center.x +
                Math.cos(angle) *
                radius,

            y:
                center.y +
                Math.sin(angle) *
                radius,
        });
    }

    /*
     * Порядок рисования пентаграммы.
     */
    const starVertices = [
        outerVertices[0],
        outerVertices[2],
        outerVertices[4],
        outerVertices[1],
        outerVertices[3],
        outerVertices[0],
    ];

    return {
        ...shape,
        type: "star",
        center: {
            x: center.x,
            y: center.y,
        },
        radius,
        direction:
            shape.direction || "up",
        vertices:
            starVertices,
    };
}


/* =========================================================
 * Shape normalization dispatcher
 * ======================================================= */

function normalizeRecognizedShape(shape) {
    if (!shape) {
        return null;
    }

    switch (shape.type) {
        case "square":
            return createSquare(shape);

        case "rhombus":
            return createRhombus(shape);

        case "triangle":
            return createTriangle(shape);

        case "star":
            return createStar(shape);

        case "circle":
            return {
                ...shape,
            };

        default:
            return null;
    }
}


/* =========================================================
 * Component
 * ======================================================= */

export default function DrawSpace() {
    const canvasRef =
        useRef(null);

    const drawingRef =
        useRef(false);

    const pointsRef =
        useRef([]);

    const recognizedShapeRef =
        useRef(null);

    const dragCenterRef =
        useRef(null);

    const placedShapesRef =
        useRef([]);

    const lastPointerRef =
        useRef(null);

    const [recognizedShape, setRecognizedShape] =
        useState(null);

    const [placedShapes, setPlacedShapes] =
        useState([]);

    const [canvasSize, setCanvasSize] =
        useState({
            width: 600,
            height: 600,
        });


    useEffect(() => {
        recognizedShapeRef.current =
            recognizedShape;
    }, [recognizedShape]);


    useEffect(() => {
        placedShapesRef.current =
            placedShapes;
    }, [placedShapes]);


    const getCanvasPoint =
        useCallback(
            event => {
                const canvas =
                    canvasRef.current;

                if (!canvas) {
                    return null;
                }

                const rect =
                    canvas.getBoundingClientRect();

                return {
                    x:
                        event.clientX -
                        rect.left,

                    y:
                        event.clientY -
                        rect.top,
                };
            },
            []
        );


    const drawShape =
        useCallback(
            (ctx, shape) => {
                if (!shape) {
                    return;
                }

                ctx.beginPath();

                if (
                    shape.type === "circle"
                ) {
                    if (
                        !shape.center ||
                        !Number.isFinite(
                            shape.radius
                        )
                    ) {
                        return;
                    }

                    ctx.arc(
                        shape.center.x,
                        shape.center.y,
                        shape.radius,
                        0,
                        Math.PI * 2
                    );
                } else if (
                    shape.vertices &&
                    shape.vertices.length >= 2
                ) {
                    const first =
                        shape.vertices[0];

                    ctx.moveTo(
                        first.x,
                        first.y
                    );

                    for (
                        let i = 1;
                        i <
                        shape.vertices.length;
                        i++
                    ) {
                        const point =
                            shape.vertices[i];

                        ctx.lineTo(
                            point.x,
                            point.y
                        );
                    }

                    if (
                        shape.type !==
                        "star"
                    ) {
                        ctx.closePath();
                    }
                }

                ctx.stroke();
            },
            []
        );


    const redraw =
        useCallback(() => {
            const canvas =
                canvasRef.current;

            if (!canvas) {
                return;
            }

            const ctx =
                canvas.getContext("2d");

            if (!ctx) {
                return;
            }

            /*
             * canvas.width/height находятся
             * в физических пикселях, поэтому
             * clearRect должен использовать их.
             */
            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            ctx.lineWidth = 2;
            ctx.strokeStyle = "#222";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            for (
                const shape of
                placedShapesRef.current
            ) {
                drawShape(
                    ctx,
                    shape
                );
            }

            const currentShape =
                recognizedShapeRef.current;

            if (currentShape) {
                drawShape(
                    ctx,
                    currentShape
                );

                return;
            }

            const points =
                pointsRef.current;

            if (
                points.length < 2
            ) {
                return;
            }

            ctx.beginPath();

            ctx.moveTo(
                points[0].x,
                points[0].y
            );

            for (
                let i = 1;
                i < points.length;
                i++
            ) {
                ctx.lineTo(
                    points[i].x,
                    points[i].y
                );
            }

            ctx.stroke();
        }, [drawShape]);


    useEffect(() => {
        const canvas =
            canvasRef.current;

        if (!canvas) {
            return;
        }

        const rect =
            canvas.getBoundingClientRect();

        const dpr =
            window.devicePixelRatio ||
            1;

        canvas.width =
            rect.width * dpr;

        canvas.height =
            rect.height * dpr;

        const ctx =
            canvas.getContext("2d");

        if (!ctx) {
            return;
        }

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        setCanvasSize({
            width: rect.width,
            height: rect.height,
        });

        redraw();
    }, [redraw]);


    useEffect(() => {
        redraw();
    }, [
        placedShapes,
        recognizedShape,
        redraw,
    ]);


    const getSnapPoints =
        useCallback(
            () => {
                const points = [];

                /*
                 * Центр поля.
                 */
                points.push({
                    x:
                        canvasSize.width / 2,

                    y:
                        canvasSize.height / 2,
                });

                /*
                 * Вершины установленных фигур.
                 * Центры фигур НЕ являются snap points.
                 */
                for (
                    const shape of
                    placedShapesRef.current
                ) {
                    if (
                        !shape.vertices ||
                        shape.vertices.length === 0
                    ) {
                        continue;
                    }

                    if (
                        shape.type ===
                        "star"
                    ) {
                        /*
                         * Последняя точка звезды
                         * повторяет первую.
                         */
                        for (
                            const vertex of
                            shape.vertices.slice(
                                0,
                                5
                            )
                        ) {
                            points.push({
                                x: vertex.x,
                                y: vertex.y,
                            });
                        }

                        continue;
                    }

                    for (
                        const vertex of
                        shape.vertices
                    ) {
                        points.push({
                            x: vertex.x,
                            y: vertex.y,
                        });
                    }
                }

                return points;
            },
            [canvasSize]
        );


    const findNearestSnapPoint =
        useCallback(
            point => {
                const snapPoints =
                    getSnapPoints();

                let nearest = null;
                let nearestDistance =
                    Infinity;

                for (
                    const snapPoint of
                    snapPoints
                ) {
                    const currentDistance =
                        distance(
                            point,
                            snapPoint
                        );

                    if (
                        currentDistance <
                        nearestDistance
                    ) {
                        nearest =
                            snapPoint;

                        nearestDistance =
                            currentDistance;
                    }
                }

                if (
                    !nearest ||
                    nearestDistance >
                        SNAP_RADIUS
                ) {
                    return null;
                }

                return {
                    point: nearest,
                    distance:
                        nearestDistance,
                };
            },
            [getSnapPoints]
        );


    const drawRecognizedShapeAtCursor =
        useCallback(
            shape => {
                const canvas =
                    canvasRef.current;

                if (
                    !canvas ||
                    !shape
                ) {
                    return;
                }

                const ctx =
                    canvas.getContext("2d");

                if (!ctx) {
                    return;
                }

                ctx.clearRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                ctx.lineWidth = 2;
                ctx.strokeStyle = "#222";
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                for (
                    const placedShape of
                    placedShapesRef.current
                ) {
                    drawShape(
                        ctx,
                        placedShape
                    );
                }

                drawShape(
                    ctx,
                    shape
                );
            },
            [drawShape]
        );


    const handlePointerDown =
        useCallback(
            event => {
                event.preventDefault();

                const point =
                    getCanvasPoint(event);

                if (!point) {
                    return;
                }

                const canvas =
                    canvasRef.current;

                if (
                    canvas &&
                    canvas.setPointerCapture
                ) {
                    try {
                        canvas.setPointerCapture(
                            event.pointerId
                        );
                    } catch {
                        // ignore
                    }
                }

                drawingRef.current =
                    true;

                pointsRef.current = [
                    point,
                ];

                recognizedShapeRef.current =
                    null;

                dragCenterRef.current =
                    null;

                lastPointerRef.current =
                    point;

                setRecognizedShape(
                    null
                );
            },
            [getCanvasPoint]
        );


    const handlePointerMove =
        useCallback(
            event => {
                if (
                    !drawingRef.current
                ) {
                    return;
                }

                event.preventDefault();

                const point =
                    getCanvasPoint(event);

                if (!point) {
                    return;
                }

                lastPointerRef.current =
                    point;

                /*
                 * Уже распознанная фигура.
                 */
                const currentShape =
                    recognizedShapeRef.current;

                if (currentShape) {
                    const center =
                        getShapeCenter(
                            currentShape
                        );

                    const moved =
                        moveShape(
                            currentShape,

                            point.x -
                                center.x,

                            point.y -
                                center.y
                        );

                    recognizedShapeRef.current =
                        moved;

                    setRecognizedShape(
                        moved
                    );

                    drawRecognizedShapeAtCursor(
                        moved
                    );

                    return;
                }

                pointsRef.current.push(
                    point
                );

                const result =
                    recognizeShape(
                        pointsRef.current
                    );

                if (
                    !result ||
                    result.probability <= 0
                ) {
                    redraw();
                    return;
                }

                const normalized =
                    normalizeRecognizedShape(
                        result
                    );

                if (!normalized) {
                    redraw();
                    return;
                }

                /*
                 * Ставим центр идеальной фигуры
                 * под текущий курсор.
                 */
                const center =
                    getShapeCenter(
                        normalized
                    );

                const moved =
                    moveShape(
                        normalized,

                        point.x -
                            center.x,

                        point.y -
                            center.y
                    );

                recognizedShapeRef.current =
                    moved;

                dragCenterRef.current = {
                    x: point.x,
                    y: point.y,
                };

                setRecognizedShape(
                    moved
                );

                drawRecognizedShapeAtCursor(
                    moved
                );
            },
            [
                getCanvasPoint,
                redraw,
                drawRecognizedShapeAtCursor,
            ]
        );


    const handlePointerUp =
        useCallback(
            event => {
                if (
                    !drawingRef.current
                ) {
                    return;
                }

                event.preventDefault();

                const canvas =
                    canvasRef.current;

                if (
                    canvas &&
                    canvas.releasePointerCapture
                ) {
                    try {
                        canvas.releasePointerCapture(
                            event.pointerId
                        );
                    } catch {
                        // ignore
                    }
                }

                drawingRef.current =
                    false;

                const shape =
                    recognizedShapeRef.current;

                /*
                 * Не распознали.
                 */
                if (!shape) {
                    pointsRef.current = [];

                    dragCenterRef.current =
                        null;

                    lastPointerRef.current =
                        null;

                    redraw();

                    return;
                }

                const releasePoint =
                    getCanvasPoint(event) ||
                    lastPointerRef.current;

                if (!releasePoint) {
                    recognizedShapeRef.current =
                        null;

                    setRecognizedShape(
                        null
                    );

                    pointsRef.current = [];

                    redraw();

                    return;
                }

                /*
                 * В этот момент центр фигуры
                 * находится под курсором.
                 */
                const currentCenter =
                    getShapeCenter(
                        shape
                    );

                const movedToRelease =
                    moveShape(
                        shape,

                        releasePoint.x -
                            currentCenter.x,

                        releasePoint.y -
                            currentCenter.y
                    );

                const snap =
                    findNearestSnapPoint(
                        releasePoint
                    );

                /*
                 * Нет snap point —
                 * фигура исчезает.
                 */
                if (!snap) {
                    recognizedShapeRef.current =
                        null;

                    setRecognizedShape(
                        null
                    );

                    pointsRef.current = [];

                    dragCenterRef.current =
                        null;

                    lastPointerRef.current =
                        null;

                    redraw();

                    return;
                }

                /*
                 * Теперь ставим центр точно
                 * в snap point.
                 */
                const finalCenter =
                    getShapeCenter(
                        movedToRelease
                    );

                const finalShape =
                    moveShape(
                        movedToRelease,

                        snap.point.x -
                            finalCenter.x,

                        snap.point.y -
                            finalCenter.y
                    );

                const nextPlacedShapes = [
                    ...placedShapesRef.current,
                    finalShape,
                ];

                placedShapesRef.current =
                    nextPlacedShapes;

                setPlacedShapes(
                    nextPlacedShapes
                );

                recognizedShapeRef.current =
                    null;

                setRecognizedShape(
                    null
                );

                pointsRef.current = [];

                dragCenterRef.current =
                    null;

                lastPointerRef.current =
                    null;
            },
            [
                getCanvasPoint,
                findNearestSnapPoint,
                redraw,
            ]
        );


    const handleDoubleClick =
        useCallback(
            event => {
                event.preventDefault();

                pointsRef.current = [];

                recognizedShapeRef.current =
                    null;

                dragCenterRef.current =
                    null;

                lastPointerRef.current =
                    null;

                placedShapesRef.current =
                    [];

                setRecognizedShape(
                    null
                );

                setPlacedShapes(
                    []
                );

                redraw();
            },
            [redraw]
        );


    return (
        <div className="draw-space">
            <canvas
                ref={canvasRef}
                className="draw-space__canvas"
                width={canvasSize.width}
                height={canvasSize.height}
                onPointerDown={
                    handlePointerDown
                }
                onPointerMove={
                    handlePointerMove
                }
                onPointerUp={
                    handlePointerUp
                }
                onPointerCancel={
                    handlePointerUp
                }
                onDoubleClick={
                    handleDoubleClick
                }
            />

            {recognizedShape && (
                <div className="draw-space__result">
                    {recognizedShape.type}
                </div>
            )}
        </div>
    );
}
