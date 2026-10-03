import {
    sideLengths,
    angles,
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
         * Для квадрата все стороны должны быть примерно одинаковыми.
         *
         * Это важнее ориентации: квадрат может быть повернут
         * на любой угол.
         */
        const sideScore = minMaxRatio(sides);

        if (sideScore < 0.82) {
            continue;
        }

        const vertexAngles = angles(vertices);

        /*
         * У квадрата все четыре угла близки к 90°.
         */
        const angleErrors = vertexAngles.map(
            angle => Math.abs(angle - 90) / 90
        );

        const angleScore = Math.max(
            0,
            1 - average(angleErrors)
        );

        /*
         * Не допускаем четырехугольники с очень плохой геометрией.
         */
        if (angleScore < 0.72) {
            continue;
        }

        /*
         * Проверяем, что противоположные стороны действительно
         * примерно параллельны.
         */
        const parallelScore =
            calculateParallelScore(vertices);

        const area = polygonArea(vertices);

        const areaScore = Math.min(
            1,
            area / (size * size * 0.45)
        );

        const probability =
            sideScore * 0.40 +
            angleScore * 0.45 +
            parallelScore * 0.10 +
            areaScore * 0.05;

        if (probability > bestProbability) {
            bestProbability = probability;
            bestVertices = vertices;
        }
    }

    /*
     * Квадрат должен быть действительно квадратом.
     * Порог достаточно высокий, чтобы ромб не начинал
     * случайно классифицироваться как квадрат.
     */
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
     * Нормализация:
     *
     * исходный квадрат мог быть повернут на любой угол.
     * Нам это больше не важно.
     *
     * Строим новый квадрат со сторонами строго
     * параллельными осям экрана.
     */
    const center = calculateCenter(bestVertices);

    const averageSide =
        average(sideLengths(bestVertices));

    const halfSize = averageSide / 2;

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
                (sum, vertex) => sum + vertex.x,
                0
            ) / vertices.length,

        y:
            vertices.reduce(
                (sum, vertex) => sum + vertex.y,
                0
            ) / vertices.length,
    };
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

    const scoreA = parallelism(
        vectors[0],
        vectors[2]
    );

    const scoreB = parallelism(
        vectors[1],
        vectors[3]
    );

    return (scoreA + scoreB) / 2;
}

function parallelism(a, b) {
    const lengthA = Math.hypot(a.x, a.y);
    const lengthB = Math.hypot(b.x, b.y);

    if (lengthA === 0 || lengthB === 0) {
        return 0;
    }

    const normalizedDot =
        Math.abs(
            (a.x * b.x + a.y * b.y) /
            (lengthA * lengthB)
        );

    return Math.min(
        1,
        normalizedDot
    );
}