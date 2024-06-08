export function debounce<F extends (...args: any[]) => any>(func: F, wait: number): (...args: Parameters<F>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null;

    return function debounced(...args: Parameters<F>) {
        const later = () => {
            timeoutId = null;
            func(...args);
        };

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(later, wait);
    };
}
