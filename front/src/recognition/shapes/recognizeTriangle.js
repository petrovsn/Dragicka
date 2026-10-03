import {
    getBounds,
    polygonArea,
    sideLengths,
    angles,
    minMaxRatio,
    average,
    simplifyClosed,
    isClosed,
} from "../geometry";

export function recognizeTriangle(points) {
    if (!points || points.length < 10) {
        return {
            type: "triangle",
            probability: 0,
        };
    }

    if (!isClosed(points)) {
        return {
            type: "triangle",
            probability: 0,
        };
    }

    const bounds = getBounds(points);

    const size = Math.max(
        bounds.width,
        bounds.height
    );

    if (size === 0) {
        return {
            type: "triangle",
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
    ];

    for (const tolerance of tolerances) {
        const vertices = simplifyClosed(
            points,
            size * tolerance
        );

        if (vertices.length !== 3) {
            continue;
        }

        const sides = sideLengths(vertices);
        const triangleAngles = angles(vertices);

        /*
         * Все три стороны должны быть примерно
         * одинаковыми.
         */
        const sideScore = minMaxRatio(sides);

        /*
         * Все углы должны быть около 60°.
         */
        const angleErrors = triangleAngles.map(
            angle => Math.abs(angle - 60) / 60
        );

        const angleScore = Math.max(
            0,
            1 - average(angleErrors)
        );

        /*
         * Проверяем, что фигура действительно занимает
         * заметную площадь.
         */
        const area = polygonArea(vertices);

        const areaScore = Math.min(
            1,
            area / (size * size * 0.15)
        );

        /*
         * Для треугольника требуем достаточно хорошего
         * совпадения и сторон, и углов.
         */
        const probability =
            sideScore * 0.60 +
            angleScore * 0.30 +
            areaScore * 0.10;

        if (probability > bestProbability) {
            bestProbability = probability;
            bestVertices = vertices;
        }
    }

    /*
     * Повышаем порог, чтобы случайные замкнутые
     * контуры не превращались в треугольники.
     */
    if (
        !bestVertices ||
        bestProbability < 0.60
    ) {
        return {
            type: "triangle",
            probability: 0,
        };
    }

    /*
     * Определяем ориентацию треугольника.
     */
    const direction =
        detectTriangleDirection(
            bestVertices
        );

    return {
        type: "triangle",
        probability: Math.min(
            1,
            bestProbability
        ),
        direction,
        vertices: bestVertices,
    };
}


/*
 * Определяет, куда направлена вершина:
 *
 *        up
 *        ▲
 *
 * left ◀   ▶ right
 *
 *        ▼
 *       down
 *
 * В отличие от поиска самой дальней вершины,
 * здесь анализируется ориентация каждой стороны
 * и положение противоположной вершины.
 */
function detectTriangleDirection(vertices) {
    const directions = [
        {
            name: "up",
            angle: -Math.PI / 2,
        },
        {
            name: "right",
            angle: 0,
        },
        {
            name: "down",
            angle: Math.PI / 2,
        },
        {
            name: "left",
            angle: Math.PI,
        },
    ];

    let bestDirection = "up";
    let bestScore = -Infinity;

    /*
     * Для каждой вершины рассматриваем её как вершину
     * треугольника, а две остальные — как основание.
     */
    for (let i = 0; i < 3; i++) {
        const tip = vertices[i];

        const baseA =
            vertices[(i + 1) % 3];

        const baseB =
            vertices[(i + 2) % 3];

        /*
         * Середина противоположной стороны.
         */
        const baseCenter = {
            x: (baseA.x + baseB.x) / 2,
            y: (baseA.y + baseB.y) / 2,
        };

        /*
         * Направление от основания к вершине.
         *
         * Это и есть высота треугольника.
         */
        const dx =
            tip.x - baseCenter.x;

        const dy =
            tip.y - baseCenter.y;

        const length =
            Math.hypot(dx, dy);

        if (length === 0) {
            continue;
        }

        const angle =
            Math.atan2(dy, dx);

        /*
         * Проверяем, к какому из четырёх направлений
         * ближе эта высота.
         */
        for (const direction of directions) {
            const difference =
                angularDifference(
                    angle,
                    direction.angle
                );

            /*
             * Чем ближе высота к горизонтали/вертикали,
             * тем выше score.
             */
            const directionScore =
                1 - difference / (Math.PI / 2);

            /*
             * Дополнительно предпочитаем вершину,
             * у которой основание действительно находится
             * примерно перпендикулярно направлению высоты.
             */
            const baseDx =
                baseB.x - baseA.x;

            const baseDy =
                baseB.y - baseA.y;

            const baseAngle =
                Math.atan2(
                    baseDy,
                    baseDx
                );

            const expectedBaseAngle =
                direction.angle +
                Math.PI / 2;

            const baseDifference =
                angularDifference(
                    baseAngle,
                    expectedBaseAngle
                );

            /*
             * У стороны нет направления, поэтому угол
             * с разворотом на 180° эквивалентен.
             */
            const baseAxisDifference =
                Math.min(
                    baseDifference,
                    Math.abs(
                        baseDifference - Math.PI
                    )
                );

            const baseScore =
                1 -
                Math.min(
                    1,
                    baseAxisDifference /
                    (Math.PI / 2)
                );

            const score =
                directionScore * 0.70 +
                baseScore * 0.30;

            if (score > bestScore) {
                bestScore = score;
                bestDirection =
                    direction.name;
            }
        }
    }

    return bestDirection;
}


function angularDifference(a, b) {
    let difference = a - b;

    while (difference > Math.PI) {
        difference -= Math.PI * 2;
    }

    while (difference < -Math.PI) {
        difference += Math.PI * 2;
    }

    return Math.abs(difference);
}