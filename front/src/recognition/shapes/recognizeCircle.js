import {
    getBounds,
    distance,
    average,
    isClosed,
} from "../geometry";

export function recognizeCircle(points) {
    if (!points || points.length < 20) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    if (!isClosed(points)) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    const bounds = getBounds(points);

    if (
        bounds.width <= 0 ||
        bounds.height <= 0
    ) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    const aspectRatio =
        Math.min(
            bounds.width,
            bounds.height
        ) /
        Math.max(
            bounds.width,
            bounds.height
        );

    /*
     * Слишком вытянутый контур кругом быть не должен.
     */
    if (aspectRatio < 0.72) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    const aspectScore =
        Math.max(
            0,
            Math.min(
                1,
                (aspectRatio - 0.72) / 0.28
            )
        );

    const center = {
        x:
            (bounds.minX + bounds.maxX) / 2,

        y:
            (bounds.minY + bounds.maxY) / 2,
    };

    const radius =
        (bounds.width + bounds.height) / 4;

    if (radius <= 0) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    /*
     * ---------------------------------------------------------
     * 1. Обычная радиальная ошибка
     * ---------------------------------------------------------
     *
     * Для круга все точки должны находиться примерно
     * на одинаковом расстоянии от центра.
     */
    const radialDistances = points.map(
        point => distance(point, center)
    );

    const radialErrors =
        radialDistances.map(
            actualRadius =>
                Math.abs(
                    actualRadius - radius
                ) / radius
        );

    const radialError =
        average(radialErrors);

    const radialScore =
        Math.max(
            0,
            1 - radialError * 2.5
        );

    /*
     * ---------------------------------------------------------
     * 2. Проверка радиальной равномерности ПО УГЛУ
     * ---------------------------------------------------------
     *
     * Это главное отличие от старой версии.
     *
     * У звезды средний радиус может оказаться достаточно
     * близким к радиусу круга, но по углам радиус сильно
     * меняется:
     *
     *     большой → маленький → большой → маленький...
     *
     * Поэтому разбиваем окружность на сектора и смотрим,
     * насколько стабилен средний радиус каждого сектора.
     */
    const sectorCount = 36;

    const sectors = Array.from(
        { length: sectorCount },
        () => []
    );

    for (let i = 0; i < points.length; i++) {
        const point = points[i];

        const dx =
            point.x - center.x;

        const dy =
            point.y - center.y;

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
            radialDistances[i]
        );
    }

    /*
     * Не все сектора обязаны иметь точки:
     * пользователь мог рисовать неравномерно.
     *
     * Но для нормального круга большая часть секторов
     * должна быть заполнена.
     */
    const sectorValues = sectors
        .map(values => {
            if (values.length === 0) {
                return null;
            }

            return average(values);
        })
        .filter(value => value !== null);

    if (sectorValues.length < sectorCount * 0.55) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    const sectorErrors =
        sectorValues.map(
            value =>
                Math.abs(value - radius) /
                radius
        );

    const sectorError =
        average(sectorErrors);

    const sectorScore =
        Math.max(
            0,
            1 - sectorError * 3.5
        );

    /*
     * ---------------------------------------------------------
     * 3. Проверяем разброс радиусов между секторами
     * ---------------------------------------------------------
     *
     * У круга std-подобный разброс должен быть небольшим.
     *
     * У звезды он существенно больше из-за лучей.
     */
    const sectorMean =
        average(sectorValues);

    const sectorDeviation =
        average(
            sectorValues.map(
                value =>
                    Math.abs(
                        value - sectorMean
                    ) / radius
            )
        );

    const uniformityScore =
        Math.max(
            0,
            1 - sectorDeviation * 4
        );

    /*
     * Если радиус по углу заметно скачет,
     * это почти наверняка не круг.
     */
    if (sectorScore < 0.55) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    /*
     * Итоговая вероятность.
     *
     * В старой версии радиальная ошибка имела слишком большой
     * вес. Теперь важна именно угловая равномерность.
     */
    const probability =
        aspectScore * 0.20 +
        radialScore * 0.25 +
        sectorScore * 0.35 +
        uniformityScore * 0.20;

    /*
     * Не выдаем круг при слабом соответствии.
     */
    if (probability < 0.58) {
        return {
            type: "circle",
            probability: 0,
        };
    }

    return {
        type: "circle",
        probability: Math.min(
            1,
            probability
        ),
        center,
        radius,
    };
}