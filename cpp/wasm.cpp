#include "haar.hpp"
#include <exception>
#include <memory>
#include <string>
// Worker owns a single session. Every allocating ABI function catches failures.
namespace {
std::unique_ptr<haar::Session> session;
std::vector<haar::Signal> output;
haar::Signal bins;
std::string error;
}
extern "C" {
unsigned haar_max() { return haar::max_padded; }
const char* haar_error() { return error.c_str(); }
void haar_clear() { session.reset();output.clear();bins.clear(); }
int haar_load(const float* left,const float* right,unsigned n,unsigned channels) {
    try {
        haar_clear();
        if(channels<1 || channels>2 || !n || n>haar::max_padded) throw std::runtime_error("Invalid audio length/channels");
        std::vector<haar::Signal> pcm{haar::Signal(left,left+n)};
        if(channels==2) pcm.emplace_back(right,right+n);
        session=std::make_unique<haar::Session>(pcm);return int(session->m);
    } catch(const std::exception& e) { error=e.what();return 0; }
}
float haar_reconstruct(const uint8_t* off,unsigned rows,const uint32_t* ex,unsigned count) {
    try {
        if(!session) throw std::runtime_error("No session");
        output.clear();output=session->reconstruct({off,rows},{ex,count});return haar::peak_guard(output);
    } catch(const std::exception& e) { error=e.what();return -1; }
}
const float* haar_channel(unsigned index) { return output.at(index).data(); }
const float* haar_bins(unsigned start,unsigned end,unsigned width) {
    try {
        if(!session) throw std::runtime_error("No session");
        bins=session->bins(start,end,width);return bins.data();
    } catch(const std::exception& e) { error=e.what();return nullptr; }
}
}
