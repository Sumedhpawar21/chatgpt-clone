import type { NextFunction, Request, Response } from "express";

class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 500) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}

export { AppError };

export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
) => {
    console.error(err);

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    }

    return res.status(500).json({
        success: false,
        message: "Internal server error",
    });
};
