#pragma once
// created by @pseujar
// libanogs.so direct patch: MOV W0,#0 + RET over report/detection entries.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/mman.h>
#include <unistd.h>

namespace Anogs {

static uintptr_t anogs_base = 0;
static bool installed = false;

// ARM64: MOV W0, #0; RET
static const uint8_t RET_FALSE[8] = {0x00, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6};

struct Patch { uintptr_t off; const char *name; };
static const Patch kPatches[] = {
    {0x1C54B4, "AnoSDKGetReportData"},
    {0x1C7F5C, "AnoSDKGetReportData4"},
    {0x1C6E40, "AnoSDKIoctl"},
    {0x1C4114, "AnoSDKSetUserInfo"},
    {0x1C8884, "AnoSDKOnRecvSignature"},
    {0x444988, "lawda"},
    {0x3DDCF8, "detect"},
    {0x3A4B8C, "lahsan"},
    {0x2EED68, "jkal"},
    {0x4BBFE8, "dyak+608"},
};

static uintptr_t GetModuleBase()
{
    FILE *fp = fopen("/proc/self/maps", "r");
    uintptr_t addr = 0;
    if (fp) {
        char line[1024];
        while (fgets(line, sizeof(line), fp)) {
            if (strstr(line, "libanogs.so")) {
                addr = (uintptr_t)strtoul(strtok(line, "-"), NULL, 16);
                break;
            }
        }
        fclose(fp);
    }
    return addr;
}

static bool LooksLikeFunc(uintptr_t addr)
{
    uint32_t w = *(volatile uint32_t *)addr;
    if ((w & 0xFFC07FFF) == 0xA9807BFD) return true;
    if ((w & 0xFFC00000) == 0xA9000000) return true;
    if (w == 0xD503233F) return true;
    if ((w & 0xFFFFFF1F) == 0xD503241F) return true;
    if ((w & 0x7F800000) == 0x52800000) return true;
    return false;
}

static void PatchAt(uintptr_t offset)
{
    if (!anogs_base) return;
    uintptr_t addr = anogs_base + offset;
    if (addr < 0x100000) return;
    if (!LooksLikeFunc(addr)) return;

    long page = sysconf(_SC_PAGESIZE);
    uintptr_t start = addr & ~((uintptr_t)page - 1);
    size_t len = (size_t)((addr + sizeof(RET_FALSE) - start + page - 1) & ~((uintptr_t)page - 1));

    if (mprotect((void *)start, len, PROT_READ | PROT_WRITE | PROT_EXEC) != 0) return;
    memcpy((void *)addr, RET_FALSE, sizeof(RET_FALSE));
    __builtin___clear_cache((void *)addr, (void *)(addr + sizeof(RET_FALSE)));
    mprotect((void *)start, len, PROT_READ | PROT_EXEC);
}

inline void Install()
{
    if (installed) return;
    anogs_base = GetModuleBase();
    if (!anogs_base) return;
    for (size_t i = 0; i < sizeof(kPatches) / sizeof(kPatches[0]); i++)
        PatchAt(kPatches[i].off);
    installed = true;
}

} // namespace Anogs
