import { Module } from '@nestjs/common';

import { UploadsModule } from '../uploads/uploads.module.js';
import { MaintenanceService } from './maintenance.service.js';
import { EditRenderService } from './edit-render.service.js';
import { HeavySlots } from './heavy-slots.js';
import { VideoPipelineService } from './video-pipeline.service.js';

/** The processing logic without queue consumers (tests call the services directly). */
@Module({
  imports: [UploadsModule],
  providers: [
    VideoPipelineService,
    MaintenanceService,
    EditRenderService,
    HeavySlots,
  ],
  exports: [VideoPipelineService, MaintenanceService, EditRenderService],
})
export class PipelineModule {}
