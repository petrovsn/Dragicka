import {
    sideLengths,
    minMaxRatio,
    simplifyClosed,
    isClosed,
    polygonArea,
} from "../geometry";

export function recognizeRhombus(points) {
    if (
        !points ||
        points.length < 10 ||
        !isClosed(points)
    ) {
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
    let bestGeometry = null;
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

        const sideScore =
            minMaxRatio(sides);

        /*
         * Ромб обязан иметь примерно равные стороны.
         */
        if (sideScore < 0.80) {
            continue;
        }

        const geometry =
            analyzeRhombusGeometry(vertices);

        if (!geometry.valid) {
            continue;
        }

        const area = polygonArea(vertices);

        const areaScore = Math.min(
            1,
            area / (size * size * 0.20)
        );

        const probability =
            sideScore * 0.50 +
            geometry.orientationScore * 0.35 +
            geometry.perpendicularScore * 0.10 +
            areaScore * 0.05;

        if (
            probability > bestProbability
        ) {
            bestProbability =
                probability;

            bestVertices =
                vertices;

            bestGeometry =
                geometry;
        }
    }

    if (
        !bestVertices ||
        !bestGeometry ||
        bestProbability < 0.65
    ) {
        return {
            type: "rhombus",
            probability: 0,
        };
    }

    const center =
        bestGeometry.center;

    const horizontalLength =
        bestGeometry.horizontalLength;

    const verticalLength =
        bestGeometry.verticalLength;

    /*
     * Нормализуем ромб:
     *
     *       top
     *        /\
     *       /  \
     * left <    > right
     *       \  /
     *        \/
     *      bottom
     *
     * При этом сохраняем длины обеих диагоналей.
     *
     * Поэтому если длинная диагональ была
     * горизонтальной — она останется горизонтальной.
     */
    const normalizedVertices = [
        {
            x: center.x,
            y:
                center.y -
                verticalLength / 2,
        },
        {
            x:
                center.x +
                horizontalLength / 2,
            y: center.y,
        },
        {
            x: center.x,
            y:
                center.y +
                verticalLength / 2,
        },
        {
            x:
                center.x -
                horizontalLength / 2,
            y: center.y,
        },
    ];

    let result = {
        type: "rhombus",

        probability: Math.min(
            1,
            bestProbability
        ),

        vertices:
            normalizedVertices,

        center,

        verticalDiagonalLength:
            verticalLength,

        horizontalDiagonalLength:
            horizontalLength,

        longDiagonal:
            Math.max(
                horizontalLength,
                verticalLength
            ),

        longDiagonalOrientation:
            horizontalLength >= verticalLength
                ? "horizontal"
                : "vertical",
    }

    console.log("rhombus", result)

    return result;
}


/*
 * Анализируем именно геометрию четырёхугольника,
 * не полагаясь на то, с какой вершины начался рисунок.
 */
function analyzeRhombusGeometry(vertices) {
    /*
     * После simplifyClosed вершины должны идти
     * по контуру. Поэтому противоположные вершины:
     *
     * 0 <-> 2
     * 1 <-> 3
     */
    const diagonalA = {
        start: vertices[0],
        end: vertices[2],
    };

    const diagonalB = {
        start: vertices[1],
        end: vertices[3],
    };

    const centerA = midpoint(
        diagonalA.start,
        diagonalA.end
    );

    const centerB = midpoint(
        diagonalB.start,
        diagonalB.end
    );

    /*
     * Диагонали настоящего ромба должны пересекаться
     * примерно в одной точке.
     */
    const diagonalLength = Math.max(
        distanceBetween(
            diagonalA.start,
            diagonalA.end
        ),
        distanceBetween(
            diagonalB.start,
            diagonalB.end
        )
    );

    if (diagonalLength <= 0) {
        return {
            valid: false,
        };
    }

    const centerDistance =
        distanceBetween(
            centerA,
            centerB
        );

    if (
        centerDistance >
        diagonalLength * 0.18
    ) {
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
        lengthA <= 0 ||
        lengthB <= 0
    ) {
        return {
            valid: false,
        };
    }

    /*
     * Диагонали ромба должны быть примерно
     * перпендикулярны.
     */
    const dot =
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
            1 - dot
        );

    if (
        perpendicularScore < 0.65
    ) {
        return {
            valid: false,
        };
    }

    /*
     * Главное отличие ромба от квадрата
     * в нашей системе распознавания:
     *
     * ромб ориентирован диагоналями по осям экрана.
     *
     * Поэтому одна диагональ должна быть
     * преимущественно горизонтальной,
     * другая — преимущественно вертикальной.
     */
    const orientationA =
        getAxisOrientation(
            vectorA
        );

    const orientationB =
        getAxisOrientation(
            vectorB
        );

    const orientationScore =
        Math.max(
            orientationA.horizontal *
                orientationB.vertical,

            orientationA.vertical *
                orientationB.horizontal
        );

    if (
        orientationScore < 0.65
    ) {
        return {
            valid: false,
        };
    }

    /*
     * Явно определяем горизонтальную
     * и вертикальную диагональ.
     */
    let horizontalLength;
    let verticalLength;

    if (
        orientationA.horizontal >=
        orientationA.vertical
    ) {
        horizontalLength =
            lengthA;

        verticalLength =
            lengthB;
    } else {
        horizontalLength =
            lengthB;

        verticalLength =
            lengthA;
    }

    /*
     * Дополнительная защита от ситуации,
     * когда обе диагонали практически одинаково
     * ориентированы из-за слишком кривого рисунка.
     */
    const horizontalOrientation =
        Math.max(
            orientationA.horizontal,
            orientationB.horizontal
        );

    const verticalOrientation =
        Math.max(
            orientationA.vertical,
            orientationB.vertical
        );

    if (
        horizontalOrientation < 0.65 ||
        verticalOrientation < 0.65
    ) {
        return {
            valid: false,
        };
    }

    return {
        valid: true,

        center,

        diagonalA,
        diagonalB,

        horizontalLength,
        verticalLength,

        orientationScore,
        perpendicularScore,
    };
}


function getAxisOrientation(vector) {
    const length =
        Math.hypot(
            vector.x,
            vector.y
        );

    if (length <= 0) {
        return {
            horizontal: 0,
            vertical: 0,
        };
    }

    return {
        horizontal:
            Math.abs(vector.x) /
            length,

        vertical:
            Math.abs(vector.y) /
            length,
    };
}


function midpoint(a, b) {
    return {
        x:
            (a.x + b.x) / 2,

        y:
            (a.y + b.y) / 2,
    };
}


function distanceBetween(a, b) {
    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );
}


function getShapeSize(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
        minX = Math.min(
            minX,
            point.x
        );

        maxX = Math.max(
            maxX,
            point.x
        );

        minY = Math.min(
            minY,
            point.y
        );

        maxY = Math.max(
            maxY,
            point.y
        );
    }

    return Math.max(
        maxX - minX,
        maxY - minY
    );
}
