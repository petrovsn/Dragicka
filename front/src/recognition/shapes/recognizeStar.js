import {
    getBounds,
    distance,
    average,
    isClosed,
} from "../geometry";

export function recognizeStar(points) {
    if (!points || points.length < 25) {
        return {
            type: "star",
            probability: 0,
        };
    }

    if (!isClosed(points)) {
        return {
            type: "star",
            probability: 0,
        };
    }

    const bounds = getBounds(points);

    if (
        bounds.width <= 0 ||
        bounds.height <= 0
    ) {
        return {
            type: "star",
            probability: 0,
        };
    }

    const center = {
        x:
            (bounds.minX + bounds.maxX) / 2,

        y:
            (bounds.minY + bounds.maxY) / 2,
    };

    const radius =
        Math.max(
            bounds.width,
            bounds.height
        ) / 2;

    if (radius <= 0) {
        return {
            type: "star",
            probability: 0,
        };
    }

    /*
     * Собираем радиальный профиль.
     *
     * Пентаграмма должна давать пять выраженных
     * внешних максимумов и пять внутренних минимумов.
     */
    const sectorCount = 180;

    const sectors = Array.from(
        { length: sectorCount },
        () => []
    );

    for (const point of points) {
        const dx =
            point.x - center.x;

        const dy =
            point.y - center.y;

        const radialDistance =
            Math.hypot(dx, dy);

        let angle =
            Math.atan2(dy, dx);

        if (angle < 0) {
            angle += Math.PI * 2;
        }

        const sectorIndex =
            Math.min(
                sectorCount - 1,
                Math.floor(
                    angle /
                    (Math.PI * 2) *
                    sectorCount
                )
            );

        sectors[sectorIndex].push(
            radialDistance
        );
    }

    /*
     * Интерполируем пустые сектора.
     */
    const radialProfile =
        buildRadialProfile(
            sectors,
            radius
        );

    if (radialProfile.length !== sectorCount) {
        return {
            type: "star",
            probability: 0,
        };
    }

    /*
     * Сглаживание нужно для того, чтобы неровности,
     * возникающие от движения мыши, не превращались
     * в дополнительные ложные пики.
     */
    const smoothed =
        smoothCircular(
            radialProfile,
            5
        );

    /*
     * Нормируем радиус.
     */
    const normalized =
        smoothed.map(
            value => value / radius
        );

    /*
     * Находим локальные максимумы и минимумы.
     */
    const maxima =
        findCircularExtrema(
            normalized,
            "max"
        );

    const minima =
        findCircularExtrema(
            normalized,
            "min"
        );

    /*
     * Нам нужны примерно пять внешних лучей.
     */
    if (
        maxima.length < 5 ||
        minima.length < 5
    ) {
        return {
            type: "star",
            probability: 0,
        };
    }

    const fiveMaxima =
        selectFiveBestExtrema(
            maxima,
            normalized,
            true
        );

    if (fiveMaxima.length !== 5) {
        return {
            type: "star",
            probability: 0,
        };
    }

    /*
     * Сортируем максимумы по углу.
     */
    fiveMaxima.sort(
        (a, b) => a.index - b.index
    );

    /*
     * Проверяем расстояния между пятью лучами.
     *
     * Для правильной пентаграммы они должны быть
     * примерно по 72°.
     */
    const spacingScore =
        calculateFivefoldSpacingScore(
            fiveMaxima,
            sectorCount
        );

    if (spacingScore < 0.55) {
        return {
            type: "star",
            probability: 0,
        };
    }

    /*
     * Внешние лучи должны быть действительно выражены.
     */
    const peakValues =
        fiveMaxima.map(
            peak => normalized[peak.index]
        );

    const peakAverage =
        average(peakValues);

    const peakVariation =
        average(
            peakValues.map(
                value =>
                    Math.abs(
                        value - peakAverage
                    ) /
                    Math.max(
                        peakAverage,
                        0.001
                    )
            )
        );

    const peakUniformityScore =
        Math.max(
            0,
            1 - peakVariation * 2
        );

    /*
     * Находим минимум между каждой парой соседних
     * внешних лучей.
     *
     * Это принципиально важно:
     * просто пять выпуклостей еще не делают фигуру
     * пентаграммой.
     */
    const valleyScores = [];

    for (let i = 0; i < 5; i++) {
        const current =
            fiveMaxima[i];

        const next =
            fiveMaxima[
                (i + 1) % 5
            ];

        const valley =
            findMinimumBetween(
                normalized,
                current.index,
                next.index
            );

        if (!valley) {
            return {
                type: "star",
                probability: 0,
            };
        }

        valleyScores.push(
            valley.value
        );
    }

    const valleyAverage =
        average(valleyScores);

    /*
     * У пентаграммы внутренние участки заметно
     * ближе к центру, чем внешние лучи.
     */
    const radialContrast =
        peakAverage > 0
            ? (peakAverage - valleyAverage) /
              peakAverage
            : 0;

    const contrastScore =
        Math.max(
            0,
            Math.min(
                1,
                (radialContrast - 0.12) /
                0.35
            )
        );

    /*
     * Проверяем, что профиль действительно похож
     * на пятичастотный сигнал.
     *
     * Берем расстояния между максимумами и минимумами.
     */
    const alternatingScore =
        calculateAlternatingScore(
            normalized,
            fiveMaxima
        );

    /*
     * Для круга radialContrast будет близок к нулю.
     * Поэтому звезда должна иметь заметные провалы.
     */
    if (contrastScore < 0.35) {
        return {
            type: "star",
            probability: 0,
        };
    }

    const probability =
        spacingScore * 0.25 +
        contrastScore * 0.30 +
        peakUniformityScore * 0.15 +
        alternatingScore * 0.30;

    /*
     * Достаточно высокий порог специально оставляем:
     * лучше не распознать сомнительную звезду,
     * чем превращать случайные замкнутые линии в звезды.
     */
    if (probability < 0.62) {
        return {
            type: "star",
            probability: 0,
        };
    }

    const direction =
        detectStarDirection(
            fiveMaxima,
            sectorCount
        );

    const vertices =
        createStarVertices(
            center,
            radius,
            direction
        );

    return {
        type: "star",
        probability: Math.min(
            1,
            probability
        ),
        center,
        radius,
        direction,
        vertices,
    };
}

function buildRadialProfile(
    sectors,
    fallbackRadius
) {
    const values =
        sectors.map(
            sector =>
                sector.length > 0
                    ? average(sector)
                    : null
        );

    const validIndices =
        values
            .map(
                (value, index) =>
                    value !== null
                        ? index
                        : null
            )
            .filter(
                index => index !== null
            );

    if (validIndices.length < 10) {
        return [];
    }

    const result = [];

    for (let i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            result.push(values[i]);
            continue;
        }

        let previous =
            i - 1;

        while (
            previous >= 0 &&
            values[previous] === null
        ) {
            previous--;
        }

        let next =
            i + 1;

        while (
            next < values.length &&
            values[next] === null
        ) {
            next++;
        }

        if (
            previous >= 0 &&
            next < values.length
        ) {
            result.push(
                (
                    values[previous] +
                    values[next]
                ) / 2
            );
        } else {
            result.push(
                fallbackRadius
            );
        }
    }

    return result;
}

function smoothCircular(
    values,
    windowRadius
) {
    const result = [];

    for (
        let i = 0;
        i < values.length;
        i++
    ) {
        let sum = 0;
        let count = 0;

        for (
            let offset = -windowRadius;
            offset <= windowRadius;
            offset++
        ) {
            let index =
                i + offset;

            while (index < 0) {
                index += values.length;
            }

            while (
                index >= values.length
            ) {
                index -= values.length;
            }

            sum += values[index];
            count++;
        }

        result.push(
            sum / count
        );
    }

    return result;
}

function findCircularExtrema(
    values,
    mode
) {
    const extrema = [];
    const length = values.length;

    for (
        let i = 0;
        i < length;
        i++
    ) {
        const previous =
            values[
                (i - 1 + length) %
                length
            ];

        const current =
            values[i];

        const next =
            values[
                (i + 1) % length
            ];

        const isMaximum =
            current >= previous &&
            current >= next;

        const isMinimum =
            current <= previous &&
            current <= next;

        if (
            mode === "max" &&
            isMaximum
        ) {
            extrema.push({
                index: i,
                value: current,
            });
        }

        if (
            mode === "min" &&
            isMinimum
        ) {
            extrema.push({
                index: i,
                value: current,
            });
        }
    }

    return extrema;
}

function selectFiveBestExtrema(
    extrema,
    values,
    maximize
) {
    const sorted = [...extrema].sort(
        (a, b) =>
            maximize
                ? b.value - a.value
                : a.value - b.value
    );

    const selected = [];

    /*
     * Не позволяем выбрать несколько соседних
     * точек одного и того же луча.
     */
    const minimumSeparation =
        values.length / 14;

    for (const candidate of sorted) {
        const tooClose =
            selected.some(
                existing =>
                    circularIndexDistance(
                        existing.index,
                        candidate.index,
                        values.length
                    ) < minimumSeparation
            );

        if (tooClose) {
            continue;
        }

        selected.push(candidate);

        if (selected.length === 5) {
            break;
        }
    }

    return selected;
}

function calculateFivefoldSpacingScore(
    peaks,
    sectorCount
) {
    const expected =
        sectorCount / 5;

    const distances = [];

    for (let i = 0; i < 5; i++) {
        const current =
            peaks[i].index;

        const next =
            peaks[
                (i + 1) % 5
            ].index;

        let delta =
            next - current;

        if (delta <= 0) {
            delta += sectorCount;
        }

        distances.push(delta);
    }

    const error =
        average(
            distances.map(
                distance =>
                    Math.abs(
                        distance - expected
                    ) /
                    expected
            )
        );

    return Math.max(
        0,
        1 - error * 2
    );
}

function findMinimumBetween(
    values,
    start,
    end
) {
    const length =
        values.length;

    let distance =
        end - start;

    if (distance <= 0) {
        distance += length;
    }

    if (
        distance < 2
    ) {
        return null;
    }

    let best = null;

    for (
        let step = 1;
        step < distance;
        step++
    ) {
        const index =
            (start + step) %
            length;

        const value =
            values[index];

        if (
            !best ||
            value < best.value
        ) {
            best = {
                index,
                value,
            };
        }
    }

    return best;
}

function calculateAlternatingScore(
    values,
    peaks
) {
    const length =
        values.length;

    const localScores = [];

    for (let i = 0; i < 5; i++) {
        const current =
            peaks[i];

        const next =
            peaks[
                (i + 1) % 5
            ];

        const valley =
            findMinimumBetween(
                values,
                current.index,
                next.index
            );

        if (!valley) {
            return 0;
        }

        const peak =
            values[current.index];

        const nextPeak =
            values[next.index];

        const localPeak =
            (peak + nextPeak) / 2;

        if (localPeak <= 0) {
            localScores.push(0);
            continue;
        }

        const contrast =
            (
                localPeak -
                valley.value
            ) /
            localPeak;

        localScores.push(
            Math.max(
                0,
                Math.min(
                    1,
                    contrast / 0.45
                )
            )
        );
    }

    return average(
        localScores
    );
}

function circularIndexDistance(
    a,
    b,
    length
) {
    const direct =
        Math.abs(a - b);

    return Math.min(
        direct,
        length - direct
    );
}

function detectStarDirection(
    peaks,
    sectorCount
) {
    /*
     * Первый луч должен быть близок к вертикальной оси.
     *
     * Выбираем между:
     *   up
     *   down
     */
    const upIndex =
        sectorCount * 3 / 4;

    const downIndex =
        sectorCount / 4;

    const distanceToUp =
        nearestPeakDistance(
            peaks,
            upIndex,
            sectorCount
        );

    const distanceToDown =
        nearestPeakDistance(
            peaks,
            downIndex,
            sectorCount
        );

    return distanceToUp <= distanceToDown
        ? "up"
        : "down";
}

function nearestPeakDistance(
    peaks,
    target,
    length
) {
    return Math.min(
        ...peaks.map(
            peak =>
                circularIndexDistance(
                    peak.index,
                    target,
                    length
                )
        )
    );
}

function createStarVertices(
    center,
    radius,
    direction
) {
    const outerRadius =
        radius;

    /*
     * Для правильного пентаграммного вида
     * внутренний радиус берем из геометрии
     * регулярной пятиконечной звезды.
     */
    const innerRadius =
        outerRadius *
        0.38196601125;

    const rotation =
        direction === "down"
            ? Math.PI / 2
            : -Math.PI / 2;

    /*
     * Возвращаем именно путь пентаграммы:
     *
     * 0 -> 2 -> 4 -> 1 -> 3 -> 0
     *
     * а не контур заполненной пятиконечной звезды.
     */
    const outer = [];

    const inner = [];

    for (let i = 0; i < 5; i++) {
        const outerAngle =
            rotation +
            i * Math.PI * 2 / 5;

        const innerAngle =
            outerAngle +
            Math.PI / 5;

        outer.push({
            x:
                center.x +
                Math.cos(outerAngle) *
                outerRadius,

            y:
                center.y +
                Math.sin(outerAngle) *
                outerRadius,
        });

        inner.push({
            x:
                center.x +
                Math.cos(innerAngle) *
                innerRadius,

            y:
                center.y +
                Math.sin(innerAngle) *
                innerRadius,
        });
    }

    return [
        outer[0],
        outer[2],
        outer[4],
        outer[1],
        outer[3],
        outer[0],
    ];
}