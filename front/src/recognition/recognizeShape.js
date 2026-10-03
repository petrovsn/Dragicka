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
     * Квадрат имеет приоритет над ромбом,
     * если его геометрия действительно близка к 90°.
     *
     * Поэтому повернутый квадрат:
     *
     *      /\
     *     /  \
     *     \  /
     *      \/
     *
     * сначала распознается именно как квадрат,
     * а затем normalizeSquare() разворачивает его
     * по осям экрана.
     */
    if (
        square &&
        square.probability >= 0.72
    ) {
        return square;
    }

    /*
     * Если квадрат не прошел уверенный порог,
     * ромб может быть выбран только если его собственная
     * геометрия достаточно хорошая.
     */
    if (
        rhombus &&
        rhombus.probability >= 0.72
    ) {
        return rhombus;
    }

    /*
     * Остальные фигуры выбираются обычным образом.
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