export const sendWhatsAppImproved = async (req, res) => {
    try {

        const student = await Student.findById(studentId);

        if (!student) {
            console.log(`Student not found with ID: ${studentId}`);

            return res.status(404).json({ success: false, error: "Student not found", code: 'STUDENT_NOT_FOUND' });
        }

        if (!student.parent_telephone) {
            console.log(`Student with ID: ${studentId} does not have a parent telephone number.`);
            return res.status(400).json({ success: false, error: "Student does not have a parent telephone number.", code: 'NO_PARENT_NUMBER' });
        }

        const displayStatus = status === 'entered' ? 'Entered School' :
            status === 'left' ? 'Left School' :
                status.charAt(0).toUpperCase() + status.slice(1);


        const scanTime = timestamp || new Date();

        const studentData = {
            name: student.name,
            indexNumber: student.indexNumber,
            student_email: student.student_email,
            address: student.address,
            parent_telephone: student.parent_telephone,
            status: status,
            timestamp: scanTime
        };

        const phoneNumber = student.parent_telephone.replace(/\s+/g, '');

        console.log(`Sending attendance notification to ${phoneNumber} for ${student.name}'s attendance (${displayStatus})`);


        const result = await sendWhatsAppMessage(phoneNumber, studentData, status, scanTime);


        if (result.success) {
            console.log(`WhatsApp notification sent successfully to ${phoneNumber} for ${student.name}'s attendance`);
            return res.status(200).json({ success: true, result: result.result });
        } else {
            console.error(`Failed to send WhatsApp notification to ${phoneNumber}:`, result.error);

            return res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Error in /send-message:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};