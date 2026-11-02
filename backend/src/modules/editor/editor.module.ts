import { Module } from '@nestjs/common';

import { VideosModule } from '../videos/videos.module.js';
import { EditorController } from './editor.controller.js';
import { EditorService } from './editor.service.js';

@Module({
  imports: [VideosModule],
  controllers: [EditorController],
  providers: [EditorService],
})
export class EditorModule {}
