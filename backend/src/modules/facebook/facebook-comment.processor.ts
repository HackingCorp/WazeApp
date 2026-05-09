import { Processor, Process } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { FacebookCommentResponderService } from "./facebook-comment-responder.service";

@Processor("facebook-comments")
export class FacebookCommentProcessor {
  private readonly logger = new Logger(FacebookCommentProcessor.name);

  constructor(
    private commentResponderService: FacebookCommentResponderService,
  ) {}

  @Process("process-comment")
  async handleCommentProcessing(job: Job): Promise<void> {
    this.logger.log(`Processing comment job ${job.id}`);

    try {
      await this.commentResponderService.processComment(job.data);
      this.logger.log(`Successfully processed comment job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to process comment job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to let Bull handle retry logic
    }
  }
}
