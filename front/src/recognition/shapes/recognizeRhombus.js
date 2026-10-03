import {
    sideLengths,
    angles,
    minMaxRatio,
    average,
    simplifyClosed,
    isClosed,
    polygonArea,
} from "../geometry";

export function recognizeRhombus(points) {
    if (!points || points.length < 10 || !isClosed(points)) {
        return {
            type: "rhombus",
            probability: 0,
        };
    }

    const size = getShapeSize(points);

    if (size <= 0) {
        return {
            type: "rhombus",
            probability: 0,
        };
    }

    let bestVertices = null;
    let bestProbability = 0;

    const tolerances = [
        0.008,
        0.012,
        0.018,
        0.025,
        0.035,
        0.05,
        0.07,
        0.09,
    ];

    for (const tolerance of tolerances) {
        const vertices = simplifyClosed(
            points,
            size * tolerance
        );

        if (vertices.length !== 4) {
            continue;
        }

        const sides = sideLengths(vertices);

        /*
         * Главное условие ромба:
         *
         * все четыре стороны примерно равны.
         *
         * Если это условие не выполняется, фигура вообще
         * не может быть ромбом.
         */
        const sideScore = minMaxRatio(sides);

        if (sideScore < 0.82) {
            continue;
        }

        /*
         * Проверяем, что это НЕ квадрат.
         *
         * Если углы близки к 90°, это должен классифицировать
         * recognizeSquare, а не recognizeRhombus.
         */
        const vertexAngles = angles(vertices);

        const squareAngleError =
            average(
                vertexAngles.map(
                    angle =>
                        Math.abs(angle - 90) / 90
                )
            );

        /*
         * Чем сильнее углы отличаются от 90°, тем больше
         * это похоже именно на ромб.
         */
        const nonSquareScore = Math.min(
            1,
            squareAngleError * 4
        );

        /*
         * Для настоящего ромба диагонали:
         *
         * - пересекаются в центре;
         * - перпендикулярны;
         * - одна должна быть горизонтальной;
         * - другая вертикальной.
         */
        const diagonalGeometry =
            analyzeDiagonals(vertices);

        if (!diagonalGeometry.valid) {
            continue;
        }

        const area = polygonArea(vertices);

        const areaScore = Math.min(
            1,
            area / (size * size * 0.20)
        );

        const probability =
            sideScore * 0.45 +
            nonSquareScore * 0.20 +
            diagonalGeometry.orientationScore * 0.25 +
            diagonalGeometry.perpendicularScore * 0.05 +
            areaScore * 0.05;

        if (probability > bestProbability) {
            bestProbability = probability;
            bestVertices = vertices;
        }
    }

    /*
     * Ромб должен иметь заметно ненулевую
     * непохожесть на квадрат.
     */
    if (
        !bestVertices ||
        bestProbability < 0.72
    ) {
        return {
            type: "rhombus",
            probability: 0,
        };
    }

    const diagonalGeometry =
        analyzeDiagonals(bestVertices);

    /*
     * Сохраняем положение главной и побочной осей.
     *
     * Главная ось = более длинная диагональ.
     * Она может быть вертикальной ИЛИ горизонтальной.
     */
    const diagonalA = diagonalGeometry.diagonalA;
    const diagonalB = diagonalGeometry.diagonalB;

    const center = diagonalGeometry.center;

    const diagonalALength =
        distanceBetween(
            diagonalA.start,
            diagonalA.end
        );

    const diagonalBLength =
        distanceBetween(
            diagonalB.start,
            diagonalB.end
        );

    const firstIsVertical =
        Math.abs(
            diagonalA.end.y -
            diagonalA.start.y
        ) >=
        Math.abs(
            diagonalA.end.x -
            diagonalA.start.x
        );

    const verticalDiagonal =
        firstIsVertical
            ? diagonalA
            : diagonalB;

    const horizontalDiagonal =
        firstIsVertical
            ? diagonalB
            : diagonalA;

    const verticalLength =
        firstIsVertical
            ? diagonalALength
            : diagonalBLength;

    const horizontalLength =
        firstIsVertical
            ? diagonalBLength
            : diagonalALength;

    /*
     * Нормализуем ромб.
     *
     * Вершины всегда находятся:
     *
     *        top
     *          *
     *
     * left *   +   * right
     *
     *          *
     *       bottom
     *
     * Но размеры вертикальной и горизонтальной диагоналей
     * полностью сохраняются.
     */
    const normalizedVertices = [
        {
            x: center.x,
            y: center.y - verticalLength / 2,
        },
        {
            x: center.x + horizontalLength / 2,
            y: center.y,
        },
        {
            x: center.x,
            y: center.y + verticalLength / 2,
        },
        {
            x: center.x - horizontalLength / 2,
            y: center.y,
        },
    ];

    const longDiagonal =
        Math.max(
            verticalLength,
            horizontalLength
        );

    const longDiagonalOrientation =
        verticalLength >= horizontalLength
            ? "vertical"
            : "horizontal";

    return {
        type: "rhombus",
        probability: Math.min(
            1,
            bestProbability
        ),

        vertices: normalizedVertices,

        center,

        longDiagonal,
        longDiagonalOrientation,

        verticalDiagonalLength:
            verticalLength,

        horizontalDiagonalLength:
            horizontalLength,
    };
}

function getShapeSize(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    return Math.max(
        maxX - minX,
        maxY - minY
    );
}

function analyzeDiagonals(vertices) {
    /*
     * После simplifyClosed вершины идут по контуру,
     * поэтому 0-2 и 1-3 — две диагонали.
     */
    const diagonalA = {
        start: vertices[0],
        end: vertices[2],
    };

    const diagonalB = {
        start: vertices[1],
        end: vertices[3],
    };

    const centerA = {
        x:
            (diagonalA.start.x +
                diagonalA.end.x) / 2,

        y:
            (diagonalA.start.y +
                diagonalA.end.y) / 2,
    };

    const centerB = {
        x:
            (diagonalB.start.x +
                diagonalB.end.x) / 2,

        y:
            (diagonalB.start.y +
                diagonalB.end.y) / 2,
    };

    /*
     * Для ромба диагонали должны пересекаться
     * примерно посередине.
     */
    const centerDistance =
        distanceBetween(
            centerA,
            centerB
        );

    const diagonalLength =
        Math.max(
            distanceBetween(
                diagonalA.start,
                diagonalA.end
            ),
            distanceBetween(
                diagonalB.start,
                diagonalB.end
            )
        );

    if (
        diagonalLength === 0 ||
        centerDistance > diagonalLength * 0.12
    ) {
        return {
            valid: false,
        };
    }

    const vectorA = {
        x:
            diagonalA.end.x -
            diagonalA.start.x,

        y:
            diagonalA.end.y -
            diagonalA.start.y,
    };

    const vectorB = {
        x:
            diagonalB.end.x -
            diagonalB.start.x,

        y:
            diagonalB.end.y -
            diagonalB.start.y,
    };

    const lengthA =
        Math.hypot(
            vectorA.x,
            vectorA.y
        );

    const lengthB =
        Math.hypot(
            vectorB.x,
            vectorB.y
        );

    if (
        lengthA === 0 ||
        lengthB === 0
    ) {
        return {
            valid: false,
        };
    }

    /*
     * Перпендикулярность диагоналей.
     */
    const normalizedDot =
        Math.abs(
            (
                vectorA.x * vectorB.x +
                vectorA.y * vectorB.y
            ) /
            (lengthA * lengthB)
        );

    const perpendicularScore =
        Math.max(
            0,
            1 - normalizedDot
        );

    if (perpendicularScore < 0.85) {
        return {
            valid: false,
        };
    }

    /*
     * Одна диагональ должна быть преимущественно
     * горизонтальной, другая — преимущественно вертикальной.
     *
     * Это принципиальное отличие ромба от произвольно
     * повернутого ромба.
     */
    const orientationA =
        getAxisOrientationScore(vectorA);

    const orientationB =
        getAxisOrientationScore(vectorB);

    const orientationScore =
        orientationA.horizontal *
        orientationB.vertical +
        orientationA.vertical *
        orientationB.horizontal;

    if (orientationScore < 0.75) {
        return {
            valid: false,
        };
    }

    const center = {
        x:
            (centerA.x + centerB.x) / 2,

        y:
            (centerA.y + centerB.y) / 2,
    };

    return {
        valid: true,

        diagonalA,
        diagonalB,

        center,

        perpendicularScore,

        orientationScore,
    };
}

function getAxisOrientationScore(vector) {
    const length =
        Math.hypot(
            vector.x,
            vector.y
        );

    if (length === 0) {
        return {
            horizontal: 0,
            vertical: 0,
        };
    }

    return {
        horizontal:
            Math.abs(vector.x) / length,

        vertical:
            Math.abs(vector.y) / length,
    };
}

function distanceBetween(a, b) {
    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );
}