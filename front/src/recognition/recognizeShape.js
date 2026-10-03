import { recognizeCircle } from "./shapes/recognizeCircle";
import { recognizeTriangle } from "./shapes/recognizeTriangle";
import { recognizeSquare } from "./shapes/recognizeSquare";
import { recognizeRhombus } from "./shapes/recognizeRhombus";
import { recognizeStar } from "./shapes/recognizeStar";

const recognizers = [
    recognizeCircle,
    recognizeTriangle,
    recognizeSquare,
    recognizeRhombus,
    recognizeStar,
];

export function recognizeShape(points) {
    if (!points || points.length < 10) {
        return null;
    }

    const results = recognizers.map(
        recognizer => recognizer(points)
    );

    const square = results.find(
        result => result.type === "square"
    );

    const rhombus = results.find(
        result => result.type === "rhombus"
    );

    /*
     * Квадрат и ромб — особый случай.
     *
     * Они оба имеют четыре примерно равные стороны,
     * поэтому нельзя просто выбирать результат с большей
     * probability.
     *
     * Нужно посмотреть на ориентацию исходных сторон.
     */
    if (
        square &&
        square.probability > 0 &&
        rhombus &&
        rhombus.probability > 0
    ) {
        const quadrilateralType =
            classifyQuadrilateralOrientation(
                points
            );

        if (quadrilateralType === "square") {
            return square;
        }

        if (quadrilateralType === "rhombus") {
            return rhombus;
        }
    }

    /*
     * Если распознаватель ромба сработал, а квадрат
     * не прошел свои условия — берем ромб.
     */
    if (
        rhombus &&
        rhombus.probability > 0
    ) {
        return rhombus;
    }

    /*
     * Если распознаватель квадрата сработал, а ромб
     * не прошел свои условия — берем квадрат.
     */
    if (
        square &&
        square.probability > 0
    ) {
        return square;
    }

    /*
     * Все остальные фигуры выбираются по максимальной
     * вероятности.
     */
    const candidates = results.filter(
        result =>
            result &&
            result.probability > 0
    );

    if (candidates.length === 0) {
        return null;
    }

    return candidates.reduce(
        (best, current) =>
            current.probability >
            best.probability
                ? current
                : best
    );
}

/*
 * Определяет, что перед нами:
 *
 *     square:
 *
 *       +-------+
 *       |       |
 *       |       |
 *       +-------+
 *
 *     или rhombus:
 *
 *          /\
 *         /  \
 *        <    >
 *         \  /
 *          \/
 *
 * В обоих случаях стороны примерно равны.
 *
 * Отличие:
 *
 * square  -> стороны H/V
 * rhombus -> диагонали H/V
 */
function classifyQuadrilateralOrientation(points) {
    const vertices = getBestQuadrilateral(points);

    if (!vertices) {
        return null;
    }

    /*
     * Сначала проверяем равенство сторон.
     *
     * Это обязательное условие и для квадрата,
     * и для ромба.
     */
    const sides = [];

    for (let i = 0; i < 4; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % 4];

        sides.push(
            Math.hypot(
                next.x - current.x,
                next.y - current.y
            )
        );
    }

    const minSide = Math.min(...sides);
    const maxSide = Math.max(...sides);

    if (
        minSide <= 0 ||
        minSide / maxSide < 0.82
    ) {
        return null;
    }

    /*
     * Проверяем ориентацию сторон.
     *
     * Для квадрата каждая сторона должна быть
     * либо почти горизонтальной, либо почти вертикальной.
     */
    const sideOrientationScore =
        calculateSideOrientationScore(
            vertices
        );

    /*
     * Проверяем ориентацию диагоналей.
     *
     * Для ромба одна диагональ должна быть почти
     * горизонтальной, а другая почти вертикальной.
     */
    const diagonalOrientationScore =
        calculateDiagonalOrientationScore(
            vertices
        );

    /*
     * Сначала определяем очевидные случаи.
     *
     * Важно: эти условия не требуют, чтобы углы
     * были строго 90°.
     *
     * Поэтому ромб с геометрическим углом 90°
     * всё равно будет определяться по своей ориентации.
     */
    if (
        sideOrientationScore >= 0.80 &&
        sideOrientationScore >
            diagonalOrientationScore
    ) {
        return "square";
    }

    if (
        diagonalOrientationScore >= 0.80 &&
        diagonalOrientationScore >
            sideOrientationScore
    ) {
        return "rhombus";
    }

    /*
     * Если обе оценки высокие, используем более
     * специфичный геометрический признак.
     *
     * Для осевого квадрата диагонали направлены
     * под 45°.
     *
     * Для ромба диагонали H/V.
     */
    if (
        sideOrientationScore >= 0.80
    ) {
        return "square";
    }

    if (
        diagonalOrientationScore >= 0.80
    ) {
        return "rhombus";
    }

    return null;
}

function getBestQuadrilateral(points) {
    const size = getShapeSize(points);

    if (size <= 0) {
        return null;
    }

    /*
     * Используем те же допуски, что и распознаватели
     * квадрата/ромба.
     */
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

    let bestVertices = null;

    /*
     * Нам нужен наиболее правдоподобный четырехугольник.
     * Оцениваем его по близости сторон.
     */
    let bestScore = 0;

    for (const tolerance of tolerances) {
        const vertices =
            simplifyClosedLocal(
                points,
                size * tolerance
            );

        if (vertices.length !== 4) {
            continue;
        }

        const sides = [];

        for (let i = 0; i < 4; i++) {
            const current = vertices[i];
            const next =
                vertices[(i + 1) % 4];

            sides.push(
                Math.hypot(
                    next.x - current.x,
                    next.y - current.y
                )
            );
        }

        const minSide =
            Math.min(...sides);

        const maxSide =
            Math.max(...sides);

        if (maxSide === 0) {
            continue;
        }

        const score =
            minSide / maxSide;

        if (score > bestScore) {
            bestScore = score;
            bestVertices = vertices;
        }
    }

    return bestVertices;
}

function calculateSideOrientationScore(vertices) {
    const scores = [];

    for (let i = 0; i < 4; i++) {
        const current = vertices[i];
        const next =
            vertices[(i + 1) % 4];

        const dx =
            next.x - current.x;

        const dy =
            next.y - current.y;

        const length =
            Math.hypot(dx, dy);

        if (length === 0) {
            return 0;
        }

        const horizontal =
            Math.abs(dx) / length;

        const vertical =
            Math.abs(dy) / length;

        scores.push(
            Math.max(
                horizontal,
                vertical
            )
        );
    }

    return average(scores);
}

function calculateDiagonalOrientationScore(vertices) {
    const diagonalA = {
        x:
            vertices[2].x -
            vertices[0].x,

        y:
            vertices[2].y -
            vertices[0].y,
    };

    const diagonalB = {
        x:
            vertices[3].x -
            vertices[1].x,

        y:
            vertices[3].y -
            vertices[1].y,
    };

    const lengthA =
        Math.hypot(
            diagonalA.x,
            diagonalA.y
        );

    const lengthB =
        Math.hypot(
            diagonalB.x,
            diagonalB.y
        );

    if (
        lengthA === 0 ||
        lengthB === 0
    ) {
        return 0;
    }

    const aHorizontal =
        Math.abs(
            diagonalA.x
        ) / lengthA;

    const aVertical =
        Math.abs(
            diagonalA.y
        ) / lengthA;

    const bHorizontal =
        Math.abs(
            diagonalB.x
        ) / lengthB;

    const bVertical =
        Math.abs(
            diagonalB.y
        ) / lengthB;

    /*
     * Вариант 1:
     *
     * A = horizontal
     * B = vertical
     */
    const score1 =
        aHorizontal *
        bVertical;

    /*
     * Вариант 2:
     *
     * A = vertical
     * B = horizontal
     */
    const score2 =
        aVertical *
        bHorizontal;

    return Math.max(
        score1,
        score2
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

function simplifyClosedLocal(
    points,
    epsilon
) {
    if (
        !points ||
        points.length < 4
    ) {
        return points
            ? [...points]
            : [];
    }

    let working = [...points];

    if (
        distance(
            working[0],
            working[working.length - 1]
        ) <= epsilon
    ) {
        working.pop();
    }

    if (working.length < 3) {
        return working;
    }

    const closed = [
        ...working,
        working[0],
    ];

    const simplified =
        simplifyRDP(
            closed,
            epsilon
        );

    if (
        simplified.length > 1 &&
        distance(
            simplified[0],
            simplified[
                simplified.length - 1
            ]
        ) <= epsilon
    ) {
        simplified.pop();
    }

    return simplified;
}

function simplifyRDP(
    points,
    epsilon
) {
    if (points.length <= 2) {
        return [...points];
    }

    let maxDistance = 0;
    let index = 0;

    const first = points[0];
    const last =
        points[points.length - 1];

    for (
        let i = 1;
        i < points.length - 1;
        i++
    ) {
        const currentDistance =
            perpendicularDistance(
                points[i],
                first,
                last
            );

        if (
            currentDistance >
            maxDistance
        ) {
            maxDistance =
                currentDistance;

            index = i;
        }
    }

    if (
        maxDistance > epsilon
    ) {
        const left =
            simplifyRDP(
                points.slice(
                    0,
                    index + 1
                ),
                epsilon
            );

        const right =
            simplifyRDP(
                points.slice(index),
                epsilon
            );

        return [
            ...left.slice(0, -1),
            ...right,
        ];
    }

    return [
        first,
        last,
    ];
}

function perpendicularDistance(
    point,
    lineStart,
    lineEnd
) {
    const dx =
        lineEnd.x -
        lineStart.x;

    const dy =
        lineEnd.y -
        lineStart.y;

    if (
        dx === 0 &&
        dy === 0
    ) {
        return distance(
            point,
            lineStart
        );
    }

    return Math.abs(
        dy * point.x -
        dx * point.y +
        lineEnd.x *
            lineStart.y -
        lineEnd.y *
            lineStart.x
    ) / Math.hypot(
        dx,
        dy
    );
}

function distance(a, b) {
    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );
}

function average(values) {
    if (
        !values ||
        values.length === 0
    ) {
        return 0;
    }

    return values.reduce(
        (sum, value) =>
            sum + value,
        0
    ) / values.length;
}