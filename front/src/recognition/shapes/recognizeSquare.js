import {
    sideLengths,
    minMaxRatio,
    average,
    simplifyClosed,
    isClosed,
    polygonArea,
} from "../geometry";

export function recognizeSquare(points) {
    if (!points || points.length < 10 || !isClosed(points)) {
        return {
            type: "square",
            probability: 0,
        };
    }

    const size = getShapeSize(points);

    if (size <= 0) {
        return {
            type: "square",
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
         * Квадрат обязан иметь четыре примерно равные стороны.
         */
        const sideScore = minMaxRatio(sides);

        if (sideScore < 0.82) {
            continue;
        }

        /*
         * Главное отличие квадрата от ромба:
         *
         * стороны квадрата должны быть ориентированы
         * примерно горизонтально/вертикально.
         *
         * Нам НЕ важно, насколько близки углы к 90°:
         * ориентация является главным признаком.
         */
        const sideOrientationScore =
            calculateAxisAlignedSideScore(vertices);

        if (sideOrientationScore < 0.70) {
            continue;
        }

        /*
         * Проверяем параллельность противоположных сторон.
         */
        const parallelScore =
            calculateParallelScore(vertices);

        /*
         * Площадь нужна только как слабый дополнительный
         * признак против вырожденных четырехугольников.
         */
        const area = polygonArea(vertices);

        const areaScore = Math.min(
            1,
            area / (size * size * 0.45)
        );

        const probability =
            sideScore * 0.50 +
            sideOrientationScore * 0.35 +
            parallelScore * 0.10 +
            areaScore * 0.05;

        if (probability > bestProbability) {
            bestProbability = probability;
            bestVertices = vertices;
        }
    }

    if (
        !bestVertices ||
        bestProbability < 0.72
    ) {
        return {
            type: "square",
            probability: 0,
        };
    }

    /*
     * Нормализуем квадрат строго по сторонам экрана.
     */
    const center = calculateCenter(bestVertices);

    const squareSize =
        average(sideLengths(bestVertices));

    const halfSize =
        squareSize / 2;

    const normalizedVertices = [
        {
            x: center.x - halfSize,
            y: center.y - halfSize,
        },
        {
            x: center.x + halfSize,
            y: center.y - halfSize,
        },
        {
            x: center.x + halfSize,
            y: center.y + halfSize,
        },
        {
            x: center.x - halfSize,
            y: center.y + halfSize,
        },
    ];

    return {
        type: "square",
        probability: Math.min(
            1,
            bestProbability
        ),
        vertices: normalizedVertices,
        center,
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

function calculateCenter(vertices) {
    return {
        x:
            vertices.reduce(
                (sum, vertex) =>
                    sum + vertex.x,
                0
            ) / vertices.length,

        y:
            vertices.reduce(
                (sum, vertex) =>
                    sum + vertex.y,
                0
            ) / vertices.length,
    };
}

function calculateAxisAlignedSideScore(vertices) {
    const scores = [];

    for (let i = 0; i < 4; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % 4];

        const dx =
            next.x - current.x;

        const dy =
            next.y - current.y;

        const length =
            Math.hypot(dx, dy);

        if (length === 0) {
            return 0;
        }

        /*
         * Насколько сторона горизонтальна.
         */
        const horizontal =
            Math.abs(dx) / length;

        /*
         * Насколько сторона вертикальна.
         */
        const vertical =
            Math.abs(dy) / length;

        /*
         * Для стороны подходит либо H, либо V.
         */
        scores.push(
            Math.max(
                horizontal,
                vertical
            )
        );
    }

    return average(scores);
}

function calculateParallelScore(vertices) {
    const vectors = [];

    for (let i = 0; i < 4; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % 4];

        vectors.push({
            x: next.x - current.x,
            y: next.y - current.y,
        });
    }

    const scoreA =
        parallelism(
            vectors[0],
            vectors[2]
        );

    const scoreB =
        parallelism(
            vectors[1],
            vectors[3]
        );

    return (scoreA + scoreB) / 2;
}

function parallelism(a, b) {
    const lengthA =
        Math.hypot(a.x, a.y);

    const lengthB =
        Math.hypot(b.x, b.y);

    if (
        lengthA === 0 ||
        lengthB === 0
    ) {
        return 0;
    }

    return Math.min(
        1,
        Math.abs(
            (
                a.x * b.x +
                a.y * b.y
            ) /
            (lengthA * lengthB)
        )
    );
}