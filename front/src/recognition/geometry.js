export function distance(a, b) {
    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );
}

export function getBounds(points) {
    if (!points || points.length === 0) {
        return {
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            width: 0,
            height: 0,
        };
    }

    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

export function average(values) {
    if (!values || values.length === 0) {
        return 0;
    }

    return values.reduce(
        (sum, value) => sum + value,
        0
    ) / values.length;
}

export function polygonArea(vertices) {
    if (!vertices || vertices.length < 3) {
        return 0;
    }

    let sum = 0;

    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];

        sum +=
            current.x * next.y -
            next.x * current.y;
    }

    return Math.abs(sum) / 2;
}

export function polygonCentroid(vertices) {
    if (!vertices || vertices.length === 0) {
        return {
            x: 0,
            y: 0,
        };
    }

    const area = polygonArea(vertices);

    /*
     * Для вырожденного многоугольника используем
     * обычное среднее координат.
     */
    if (area === 0) {
        return {
            x: average(vertices.map(point => point.x)),
            y: average(vertices.map(point => point.y)),
        };
    }

    let cx = 0;
    let cy = 0;
    let crossSum = 0;

    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];

        const cross =
            current.x * next.y -
            next.x * current.y;

        crossSum += cross;

        cx +=
            (current.x + next.x) * cross;

        cy +=
            (current.y + next.y) * cross;
    }

    return {
        x: cx / (3 * crossSum),
        y: cy / (3 * crossSum),
    };
}

export function sideLengths(vertices) {
    if (!vertices || vertices.length < 2) {
        return [];
    }

    return vertices.map((vertex, index) => {
        const next =
            vertices[(index + 1) % vertices.length];

        return distance(vertex, next);
    });
}

export function angleAt(vertices, index) {
    if (!vertices || vertices.length < 3) {
        return 0;
    }

    const previous =
        vertices[
            (index - 1 + vertices.length) %
            vertices.length
        ];

    const current = vertices[index];

    const next =
        vertices[
            (index + 1) % vertices.length
        ];

    const vectorA = {
        x: previous.x - current.x,
        y: previous.y - current.y,
    };

    const vectorB = {
        x: next.x - current.x,
        y: next.y - current.y,
    };

    const lengthA = Math.hypot(
        vectorA.x,
        vectorA.y
    );

    const lengthB = Math.hypot(
        vectorB.x,
        vectorB.y
    );

    if (lengthA === 0 || lengthB === 0) {
        return 0;
    }

    const dot =
        vectorA.x * vectorB.x +
        vectorA.y * vectorB.y;

    const cos = Math.max(
        -1,
        Math.min(
            1,
            dot / (lengthA * lengthB)
        )
    );

    return Math.acos(cos) * 180 / Math.PI;
}

export function angles(vertices) {
    if (!vertices || vertices.length < 3) {
        return [];
    }

    return vertices.map((_, index) =>
        angleAt(vertices, index)
    );
}

export function minMaxRatio(values) {
    if (!values || values.length === 0) {
        return 0;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    if (max === 0) {
        return 0;
    }

    return min / max;
}

export function similarityToTarget(values, target) {
    if (!values || values.length === 0 || target === 0) {
        return 0;
    }

    const errors = values.map(value =>
        Math.abs(value - target) / Math.abs(target)
    );

    return Math.max(
        0,
        1 - average(errors)
    );
}

export function perpendicularDistance(
    point,
    lineStart,
    lineEnd
) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
        return distance(point, lineStart);
    }

    return Math.abs(
        dy * point.x -
        dx * point.y +
        lineEnd.x * lineStart.y -
        lineEnd.y * lineStart.x
    ) / Math.hypot(dx, dy);
}

export function simplifyRDP(points, epsilon) {
    if (!points || points.length <= 2) {
        return points ? [...points] : [];
    }

    let maxDistance = 0;
    let index = 0;

    const first = points[0];
    const last = points[points.length - 1];

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

        if (currentDistance > maxDistance) {
            maxDistance = currentDistance;
            index = i;
        }
    }

    if (maxDistance > epsilon) {
        const left = simplifyRDP(
            points.slice(0, index + 1),
            epsilon
        );

        const right = simplifyRDP(
            points.slice(index),
            epsilon
        );

        return [
            ...left.slice(0, -1),
            ...right,
        ];
    }

    return [first, last];
}

export function simplifyClosed(points, epsilon) {
    if (!points || points.length < 4) {
        return points ? [...points] : [];
    }

    let working = [...points];

    /*
     * Убираем последнюю точку, если пользователь
     * закончил практически там же, где начал.
     */
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

    /*
     * Для замкнутого контура добавляем первую точку
     * в конец, чтобы RDP учитывал замыкание.
     */
    const closed = [
        ...working,
        working[0],
    ];

    const simplified = simplifyRDP(
        closed,
        epsilon
    );

    /*
     * Последняя точка дублирует первую.
     */
    if (
        simplified.length > 1 &&
        distance(
            simplified[0],
            simplified[simplified.length - 1]
        ) <= epsilon
    ) {
        simplified.pop();
    }

    return simplified;
}

export function normalizeVertices(vertices) {
    if (!vertices || vertices.length === 0) {
        return [];
    }

    const center = polygonCentroid(vertices);

    const result = [...vertices];

    result.sort((a, b) => {
        const angleA = Math.atan2(
            a.y - center.y,
            a.x - center.x
        );

        const angleB = Math.atan2(
            b.y - center.y,
            b.x - center.x
        );

        return angleA - angleB;
    });

    return result;
}

export function rotateArray(array, startIndex) {
    if (!array || array.length === 0) {
        return [];
    }

    return [
        ...array.slice(startIndex),
        ...array.slice(0, startIndex),
    ];
}

export function isClosed(points, ratio = 0.1) {
    if (!points || points.length < 3) {
        return false;
    }

    const first = points[0];
    const last = points[points.length - 1];

    const bounds = getBounds(points);

    const size = Math.max(
        bounds.width,
        bounds.height
    );

    if (size === 0) {
        return false;
    }

    /*
     * Расстояние между началом и концом контура
     * должно быть небольшим относительно размера фигуры.
     */
    return distance(first, last) <= size * ratio;
}

function getVerticesCenter(vertices) {
    if (!vertices || vertices.length === 0) {
        return {
            x: 0,
            y: 0,
        };
    }

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