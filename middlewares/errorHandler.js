// not found 
const notFound = (req, res, next) => {
    const error = new Error(`Not Found : ${req.originalUrl}`);
    res.status(404);
    next(error);
};

// ERROR handler 
const errorHandler = (err, req, res, next) => {
    const statuscode = res.statusCode == 200 ? 500 : res.statusCode;
    res.status(statuscode);
    
    // Don't expose stack traces in production
    const stack = process.env.NODE_ENV === 'production' ? null : err?.stack;
    
    res.json({
        success: false,
        message: err?.message,
        stack: stack,
    });
};

module.exports = {
    errorHandler,
    notFound
};