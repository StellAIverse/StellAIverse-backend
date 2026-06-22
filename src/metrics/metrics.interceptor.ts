import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestsInProgress,
  httpErrorTotal,
} from "../config/metrics";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!req) return next.handle();

    const method = req.method as string;
    const route: string =
      (req.route?.path as string | undefined) ?? req.url ?? "unknown";
    const end = httpRequestDuration.startTimer({ method, route });
    httpRequestsInProgress.inc({ method, route });

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = String(
            context.switchToHttp().getResponse().statusCode ?? 200,
          );
          end({ status_code: statusCode });
          httpRequestTotal.inc({ method, route, status_code: statusCode });
          httpRequestsInProgress.dec({ method, route });
        },
        error: (err: { status?: number }) => {
          const statusCode = String(err?.status ?? 500);
          end({ status_code: statusCode });
          httpRequestTotal.inc({ method, route, status_code: statusCode });
          httpErrorTotal.inc({ method, route, status_code: statusCode });
          httpRequestsInProgress.dec({ method, route });
        },
      }),
    );
  }
}
