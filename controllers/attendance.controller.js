import Student from '../models/student.model.js';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';

const getDateRange = (date = new Date()) => {
  const startOfDay = DateTime.fromJSDate(new Date(date)).startOf('day').toJSDate();
  const endOfDay = DateTime.fromJSDate(new Date(date)).endOf('day').toJSDate();
  return { startOfDay, endOfDay };
};

let autoCheckoutSettings = {
  enabled: false,
  time: '18:30',
  sendNotification: true,
  lastRun: null
};

export const configureAutoCheckout = async (req, res) => {
  try {
    const { enabled, time, sendNotification } = req.body;
    
    // Validate time format (HH:MM)
    if (time && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Invalid time format. Must be in HH:MM format (24-hour)'
      });
    }
    
    // Update settings
    autoCheckoutSettings = {
      ...autoCheckoutSettings,
      enabled: enabled !== undefined ? enabled : autoCheckoutSettings.enabled,
      time: time || autoCheckoutSettings.time,
      sendNotification: sendNotification !== undefined ? sendNotification : autoCheckoutSettings.sendNotification
    };
    
    return res.status(200).json({
      status: 'success',
      message: 'Auto checkout settings updated successfully',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error configuring auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to configure auto checkout',
      error: error.message
    });
  }
};

export const getAutoCheckoutSettings = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error getting auto checkout settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get auto checkout settings',
      error: error.message
    });
  }
};

export const runAutoCheckout = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const students = await Student.find({
      'attendanceHistory.date': {
        $gte: today
      },
      'attendanceHistory.status': 'entered',
      'attendanceHistory.leaveTime': null
    });
    
    console.log(`Found ${students.length} students who need auto checkout`);
    
    let processed = 0;
    let failed = 0;
    
    for (const student of students) {
      try {
        const todayRecord = student.attendanceHistory.find(record => {
          const recordDate = new Date(record.date);
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === today.getTime() && 
                 record.status === 'entered' && 
                 !record.leaveTime;
        });
        
        if (todayRecord) {
          await student.markAttendance(
            'left',
            null,
            'Auto checkout system',
            'Auto Checkout'
          );
        
          
          processed++;
        }
      } catch (studentError) {
        console.error(`Error processing auto checkout for student ${student.name}:`, studentError);
        failed++;
      }
    }
    
    autoCheckoutSettings.lastRun = new Date();
    
    return res.status(200).json({
      status: 'success',
      message: `Auto checkout completed: ${processed} students processed, ${failed} failed`,
      data: {
        processed,
        failed,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error running auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to run auto checkout',
      error: error.message
    });
  }
};

export const getScannedStudentsToday = async (req, res) => {
  try {
    const now = DateTime.now().setZone('Asia/Colombo');
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    console.log('Fetching attendance for today:', {
      startOfDay,
      endOfDay,
      currentTime: now.toJSDate()
    });

    const students = await Student.aggregate([
      {
        $match: {
          "attendanceHistory.date": { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $project: {
          name: 1,
          indexNumber: 1,
          student_email: 1,
          status: 1,
          todayAttendance: {
            $filter: {
              input: "$attendanceHistory",
              as: "record",
              cond: {
                $and: [
                  { $gte: ["$$record.date", startOfDay] },
                  { $lte: ["$$record.date", endOfDay] }
                ]
              }
            }
          },
          lastMessage: { $slice: ["$messages", -1] }
        }
      }
    ]);

    const processedStudents = students.map(student => {
      const todayRecords = student.todayAttendance || [];
      
      const latestRecord = todayRecords.length > 0
        ? todayRecords.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        })
        : null;

      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        date: latestRecord?.date || null,
        messageStatus: student.lastMessage?.[0]?.status || null,
        attendanceHistory: todayRecords,
      };
    });

    const totalStudents = await Student.countDocuments({ status: 'active' });
    const presentCount = processedStudents.filter(s => s.status === 'present' || s.status === 'entered').length;
    const leftCount = processedStudents.filter(s => s.status === 'left').length;
    const absentCount = totalStudents - presentCount - leftCount;

    const stats = {
      totalCount: totalStudents,
      presentCount,
      leftCount,
      absentCount,
      timestamp: now.toJSDate()
    };

    res.status(200).json({
      success: true,
      data: {
        students: processedStudents,
        stats
      }
    });
  } catch (error) {
    console.error('Error getting scanned students:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting scanned students',
      error: error.message
    });
  }
};

export const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params;
    
    const targetDate = DateTime.fromISO(date).setZone('Asia/Colombo');
    const startOfDay = targetDate.startOf('day').toJSDate();
    const endOfDay = targetDate.endOf('day').toJSDate();

    console.log('Fetching attendance for date:', {
      date,
      startOfDay,
      endOfDay
    });

    const students = await Student.aggregate([
      {
        $match: {
          "attendanceHistory.date": { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $project: {
          name: 1,
          indexNumber: 1,
          student_email: 1,
          status: 1,
          dateAttendance: {
            $filter: {
              input: "$attendanceHistory",
              as: "record",
              cond: {
                $and: [
                  { $gte: ["$$record.date", startOfDay] },
                  { $lte: ["$$record.date", endOfDay] }
                ]
              }
            }
          }
        }
      }
    ]);

    const processedStudents = students.map(student => {
      const dateRecords = student.dateAttendance || [];

      const latestRecord = dateRecords.length > 0
        ? dateRecords.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        })
        : null;

      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        date: latestRecord?.date || null,
        attendanceHistory: dateRecords,
      };
    });

    const totalStudents = await Student.countDocuments({ status: 'active' });
    const presentCount = processedStudents.filter(s => s.status === 'present' || s.status === 'entered').length;
    const leftCount = processedStudents.filter(s => s.status === 'left').length;
    const absentCount = totalStudents - presentCount - leftCount;

    const stats = {
      totalCount: totalStudents,
      presentCount,
      leftCount,
      absentCount,
      date: targetDate.toISODate()
    };

    res.status(200).json({
      success: true,
      data: {
        students: processedStudents,
        stats
      }
    });
  } catch (error) {
    console.error('Error getting attendance by date:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting attendance records',
      error: error.message
    });
  }
};

export const getStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      limit = 10, 
      offset = 0, 
      sortBy = 'date', 
      sortOrder = 'desc',
      startDate,
      endDate 
    } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const limitVal = parseInt(limit);
    const offsetVal = parseInt(offset);

    // Use aggregation to paginate history at the database level
    const [result] = await Student.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(studentId) } },
      {
        $project: {
          name: 1,
          indexNumber: 1,
          student_email: 1,
          attendancePercentage: 1,
          // Filter history first if dates provided
          filteredHistory: {
            $filter: {
              input: "$attendanceHistory",
              as: "record",
              cond: {
                $and: [
                  startDate ? { $gte: ["$$record.date", new Date(startDate)] } : true,
                  endDate ? { $lte: ["$$record.date", new Date(new Date(endDate).setHours(23, 59, 59, 999))] } : true
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          indexNumber: 1,
          student_email: 1,
          attendancePercentage: 1,
          totalRecords: { $size: "$filteredHistory" },
          stats: {
            presentCount: {
              $size: {
                $filter: {
                  input: "$filteredHistory",
                  as: "r",
                  cond: { $in: ["$$r.status", ["present", "entered"]] }
                }
              }
            },
            absentCount: {
              $size: {
                $filter: {
                  input: "$filteredHistory",
                  as: "r",
                  cond: { $eq: ["$$r.status", "absent"] }
                }
              }
            },
            leftCount: {
              $size: {
                $filter: {
                  input: "$filteredHistory",
                  as: "r",
                  cond: { $eq: ["$$r.status", "left"] }
                }
              }
            }
          },
          // Slice the history array for pagination
          paginatedHistory: {
            $slice: [
              { $reverseArray: "$filteredHistory" }, // Usually want latest first
              offsetVal,
              limitVal
            ]
          }
        }
      }
    ]);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log(`Found ${result.totalRecords} attendance records, returning ${result.paginatedHistory.length}`);

    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: result._id,
          name: result.name,
          indexNumber: result.indexNumber,
          student_email: result.student_email
        },
        attendanceHistory: result.paginatedHistory,
        totalRecords: result.totalRecords,
        stats: {
          ...result.stats,
          totalCount: result.totalRecords,
          attendancePercentage: result.attendancePercentage || 0
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          student_email: student.student_email
        },
        attendanceHistory: paginatedRecords,
        totalRecords,
        stats: {
          totalCount: totalRecords,
          presentCount,
          absentCount,
          leftCount,
          attendancePercentage: student.attendancePercentage || 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting student attendance history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting attendance history',
      error: error.message
    });
  }
};

export const clearStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    student.attendanceHistory = [];
    
    student.attendanceCount = 0;
    student.attendancePercentage = 0;
    student.lastAttendance = null;
    
    await student.save();

    return res.json({
      success: true,
      message: 'Attendance history cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing attendance history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error clearing attendance history'
    });
  }
};

export const deleteAttendanceRecord = async (req, res) => {
  try {
    const { studentId, recordId } = req.params;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (!Array.isArray(student.attendanceHistory)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance history format'
      });
    }

    const recordIndex = student.attendanceHistory.findIndex(
      record => record._id.toString() === recordId
    );

    if (recordIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'No attendance record found'
      });
    }

    student.attendanceHistory.splice(recordIndex, 1);
    student.lastAttendance = null;
    await student.save();

    return res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting attendance record',
      error: error.message
    });
  }
};

export default {
  configureAutoCheckout,
  getAutoCheckoutSettings,
  runAutoCheckout,
  getScannedStudentsToday,
  getAttendanceByDate,
  getStudentAttendanceHistory,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord
}; 