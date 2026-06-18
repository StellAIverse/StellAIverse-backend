import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { getTracer } from "../config/tracing";
import { SpanStatusCode } from "@opentelemetry/api";

/**
 * TracingInterceptor automatically creates OpenTelemetry spans
 * for every HTTP request handled by NestJS controllers.
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const route = `${method} ${url}`;

    const tracer = getTracer();
    const span = tracer.startSpan(`HTTP ${route}`);

    // Set span attributes
    span.setAttribute("http.method", method);
    span.setAttribute("http.url", url);
    span.setAttribute("http.route", route);

    if (request.headers?.["x-request-id"]) {
      span.setAttribute("request.id", request.headers["x-request-id"]);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        },
        error: (error: Error) => {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          span.end();
        },
      }),
    );
  }
}