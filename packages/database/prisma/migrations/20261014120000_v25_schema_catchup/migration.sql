-- V25 schema catch-up: aligns the clean migration chain with schema.prisma.
-- Evidence: scratchpad preflight_drift_investigation.md (Phase 2B) and the Step 13 FK audit.
-- Scope: AssistantMessage.companyId nullability, 47 FK delete rules, 2 Task indexes,
-- 2 budget defaults, AeEnterpriseObjective.status default. Cosmetic updatedAt defaults and
-- the EnterpriseStateRecord index rename are intentionally excluded.

-- AlterTable (must precede the SET NULL foreign key below)
ALTER TABLE "AssistantMessage" ALTER COLUMN "companyId" DROP NOT NULL;

-- AlterTable: defaults
ALTER TABLE "CompanyBudget" ALTER COLUMN "allocatedAmount" SET DEFAULT 0;
ALTER TABLE "DepartmentBudget" ALTER COLUMN "allocatedAmount" SET DEFAULT 0;
ALTER TABLE "AeEnterpriseObjective" ALTER COLUMN "status" SET DEFAULT 'DISCOVERED';

-- CreateIndex
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");
CREATE INDEX "Task_claimLockToken_idx" ON "Task"("claimLockToken");

-- DropForeignKey
ALTER TABLE "AevoraGroup" DROP CONSTRAINT "AevoraGroup_chairmanId_fkey";
ALTER TABLE "AssistantMessage" DROP CONSTRAINT "AssistantMessage_companyId_fkey";
ALTER TABLE "BrowserConversation" DROP CONSTRAINT "BrowserConversation_employeeId_fkey";
ALTER TABLE "BrowserConversation" DROP CONSTRAINT "BrowserConversation_browserProfileId_fkey";
ALTER TABLE "BrowserProfile" DROP CONSTRAINT "BrowserProfile_employeeId_fkey";
ALTER TABLE "CeoFinancialAuthority" DROP CONSTRAINT "CeoFinancialAuthority_companyId_fkey";
ALTER TABLE "CeoFinancialAuthority" DROP CONSTRAINT "CeoFinancialAuthority_ceoEmployeeId_fkey";
ALTER TABLE "CeoFinancialDecision" DROP CONSTRAINT "CeoFinancialDecision_companyId_fkey";
ALTER TABLE "CeoFinancialDecision" DROP CONSTRAINT "CeoFinancialDecision_ceoEmployeeId_fkey";
ALTER TABLE "CeoFinancialDecision" DROP CONSTRAINT "CeoFinancialDecision_authorityId_fkey";
ALTER TABLE "ChairmanCommand" DROP CONSTRAINT "ChairmanCommand_companyId_fkey";
ALTER TABLE "ChairmanCommand" DROP CONSTRAINT "ChairmanCommand_chairmanId_fkey";
ALTER TABLE "ChairmanCommand" DROP CONSTRAINT "ChairmanCommand_approvalId_fkey";
ALTER TABLE "ClientMeeting" DROP CONSTRAINT "ClientMeeting_companyId_fkey";
ALTER TABLE "ClientMeeting" DROP CONSTRAINT "ClientMeeting_leadId_fkey";
ALTER TABLE "ClientMeeting" DROP CONSTRAINT "ClientMeeting_clientId_fkey";
ALTER TABLE "ClientMeeting" DROP CONSTRAINT "ClientMeeting_projectId_fkey";
ALTER TABLE "ClientMeeting" DROP CONSTRAINT "ClientMeeting_opportunityId_fkey";
ALTER TABLE "PerformanceEvaluation" DROP CONSTRAINT "PerformanceEvaluation_companyId_fkey";
ALTER TABLE "PerformanceEvaluation" DROP CONSTRAINT "PerformanceEvaluation_employeeId_fkey";
ALTER TABLE "PerformanceEvaluation" DROP CONSTRAINT "PerformanceEvaluation_departmentId_fkey";
ALTER TABLE "PerformanceEvaluation" DROP CONSTRAINT "PerformanceEvaluation_evaluatorId_fkey";
ALTER TABLE "ProjectBuildExecution" DROP CONSTRAINT "ProjectBuildExecution_projectId_fkey";
ALTER TABLE "ProjectDevelopmentExecution" DROP CONSTRAINT "ProjectDevelopmentExecution_projectId_fkey";
ALTER TABLE "ProjectTestExecution" DROP CONSTRAINT "ProjectTestExecution_projectId_fkey";
ALTER TABLE "ResearchExecution" DROP CONSTRAINT "ResearchExecution_employeeId_fkey";
ALTER TABLE "ResearchPerspective" DROP CONSTRAINT "ResearchPerspective_employeeId_fkey";
ALTER TABLE "ResearchSynthesis" DROP CONSTRAINT "ResearchSynthesis_synthesizerId_fkey";
ALTER TABLE "StrategicMilestone" DROP CONSTRAINT "StrategicMilestone_companyId_fkey";
ALTER TABLE "StrategicMilestone" DROP CONSTRAINT "StrategicMilestone_objectiveId_fkey";
ALTER TABLE "StrategicMilestone" DROP CONSTRAINT "StrategicMilestone_ownerId_fkey";
ALTER TABLE "StrategicPlan" DROP CONSTRAINT "StrategicPlan_companyId_fkey";
ALTER TABLE "SuccessionCandidate" DROP CONSTRAINT "SuccessionCandidate_planId_fkey";
ALTER TABLE "SuccessionCandidate" DROP CONSTRAINT "SuccessionCandidate_employeeId_fkey";
ALTER TABLE "SuccessionPlan" DROP CONSTRAINT "SuccessionPlan_companyId_fkey";
ALTER TABLE "SuccessionPlan" DROP CONSTRAINT "SuccessionPlan_roleId_fkey";
ALTER TABLE "SuccessionPlan" DROP CONSTRAINT "SuccessionPlan_departmentId_fkey";
ALTER TABLE "SuccessionPlan" DROP CONSTRAINT "SuccessionPlan_currentHolderId_fkey";
ALTER TABLE "V12SpatialBuilding" DROP CONSTRAINT "V12SpatialBuilding_siteId_fkey";
ALTER TABLE "V12SpatialCity" DROP CONSTRAINT "V12SpatialCity_countryId_fkey";
ALTER TABLE "V12SpatialCountry" DROP CONSTRAINT "V12SpatialCountry_regionId_fkey";
ALTER TABLE "V12SpatialFloor" DROP CONSTRAINT "V12SpatialFloor_buildingId_fkey";
ALTER TABLE "V12SpatialParkingArea" DROP CONSTRAINT "V12SpatialParkingArea_siteId_fkey";
ALTER TABLE "V12SpatialRegion" DROP CONSTRAINT "V12SpatialRegion_worldId_fkey";
ALTER TABLE "V12SpatialRoom" DROP CONSTRAINT "V12SpatialRoom_floorId_fkey";
ALTER TABLE "V12SpatialSite" DROP CONSTRAINT "V12SpatialSite_cityId_fkey";
ALTER TABLE "V12SpatialWorkspace" DROP CONSTRAINT "V12SpatialWorkspace_roomId_fkey";

-- AddForeignKey
ALTER TABLE "AevoraGroup" ADD CONSTRAINT "AevoraGroup_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BrowserConversation" ADD CONSTRAINT "BrowserConversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserConversation" ADD CONSTRAINT "BrowserConversation_browserProfileId_fkey" FOREIGN KEY ("browserProfileId") REFERENCES "BrowserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CeoFinancialAuthority" ADD CONSTRAINT "CeoFinancialAuthority_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoFinancialAuthority" ADD CONSTRAINT "CeoFinancialAuthority_ceoEmployeeId_fkey" FOREIGN KEY ("ceoEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_ceoEmployeeId_fkey" FOREIGN KEY ("ceoEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoFinancialDecision" ADD CONSTRAINT "CeoFinancialDecision_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "CeoFinancialAuthority"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Chairman"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChairmanCommand" ADD CONSTRAINT "ChairmanCommand_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMeeting" ADD CONSTRAINT "ClientMeeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectBuildExecution" ADD CONSTRAINT "ProjectBuildExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectDevelopmentExecution" ADD CONSTRAINT "ProjectDevelopmentExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectTestExecution" ADD CONSTRAINT "ProjectTestExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchExecution" ADD CONSTRAINT "ResearchExecution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchPerspective" ADD CONSTRAINT "ResearchPerspective_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchSynthesis" ADD CONSTRAINT "ResearchSynthesis_synthesizerId_fkey" FOREIGN KEY ("synthesizerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "CompanyObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StrategicMilestone" ADD CONSTRAINT "StrategicMilestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StrategicPlan" ADD CONSTRAINT "StrategicPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SuccessionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuccessionCandidate" ADD CONSTRAINT "SuccessionCandidate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "V12SpatialBuilding" ADD CONSTRAINT "V12SpatialBuilding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "V12SpatialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialCity" ADD CONSTRAINT "V12SpatialCity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "V12SpatialCountry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialCountry" ADD CONSTRAINT "V12SpatialCountry_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "V12SpatialRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialFloor" ADD CONSTRAINT "V12SpatialFloor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "V12SpatialBuilding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialParkingArea" ADD CONSTRAINT "V12SpatialParkingArea_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "V12SpatialSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialRegion" ADD CONSTRAINT "V12SpatialRegion_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "V12SpatialWorld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialRoom" ADD CONSTRAINT "V12SpatialRoom_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "V12SpatialFloor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialSite" ADD CONSTRAINT "V12SpatialSite_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "V12SpatialCity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "V12SpatialWorkspace" ADD CONSTRAINT "V12SpatialWorkspace_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "V12SpatialRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
